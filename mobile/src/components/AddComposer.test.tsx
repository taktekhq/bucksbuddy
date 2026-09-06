// Adapted from the web's src/components/AddComposer.test.tsx — every case it
// has (the amount → category → CTA path, the sanitiser, grouping, the LBP
// estimate, save/reset, the null note, the direction reset, the error, the
// Saving… state, and all three edit-mode cases), plus the analytics events the
// mobile port captures.

// A complete, overridable Store value, as the web's src/test/storeValue.ts.
const mockStore = {
  lbpPerUsd: 89500,
  addTransaction: jest.fn(async (_p: unknown) => ({ error: null as string | null })),
  updateTransaction: jest.fn(
    async (_id: string, _p: unknown) => ({ error: null as string | null }),
  ),
};
jest.mock("@/lib/store", () => ({ useStore: () => mockStore }));

// Reanimated's own mock pulls in the real module (which needs the worklets
// native module) and throws under jest, so this is the same shape by hand.
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (c: unknown) => c },
    Easing: { bezier: () => ({}) },
    runOnJS: (fn: unknown) => fn,
    // Stable per hook call, like the real one — a fresh object each render
    // would retrigger every effect that depends on a shared value.
    useSharedValue: (v: unknown) => {
      const ref = React.useRef(null);
      if (ref.current === null) ref.current = { value: v };
      return ref.current;
    },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (to: unknown, _c: unknown, cb?: (finished: boolean) => void) => {
      cb?.(true);
      return to;
    },
  };
});

// Gesture recognition is native; the sheet's own drag logic is covered in
// CategorySheet.test.tsx, so here the detector just renders its children.
jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const build = () => {
    const g: Record<string, unknown> = {};
    for (const m of ["activeOffsetY", "onUpdate", "onEnd"]) g[m] = () => g;
    return g;
  };
  return {
    Gesture: { Pan: build },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: View,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AddComposer } from "@/components/AddComposer";
import posthog from "@/lib/posthog";
import type { Transaction } from "@/types/db";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "edit1",
    user_id: "u1",
    is_income: true,
    category: "salary",
    amount_usd_cents: 5000,
    original_currency: "USD",
    original_amount: 50,
    rate_used: 89500,
    occurred_at: "2026-06-01T10:00:00.000Z",
    note: "paycheck",
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

const amountInput = () => screen.getByLabelText("Amount");
const noteInput = () => screen.getByLabelText("Note");

async function typeAmount(value: string) {
  await fireEvent.changeText(amountInput(), value);
}

/** Open the sheet and pick a category that has no subcategories. */
async function chooseCategory(label: string) {
  await fireEvent.press(
    screen.queryByText("Add Category") ?? screen.getByText("Change ›"),
  );
  await fireEvent.press(screen.getByText(label));
}

beforeEach(() => {
  mockStore.lbpPerUsd = 89500;
  mockStore.addTransaction.mockImplementation(async () => ({ error: null }));
  mockStore.updateTransaction.mockImplementation(async () => ({ error: null }));
});

describe("AddComposer (add mode)", () => {
  it("guides the user from amount to category to a ready CTA", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    expect(screen.getByText("Enter an amount")).toBeTruthy();

    await typeAmount("12.50");
    expect(screen.getByText("Choose a category")).toBeTruthy();

    await chooseCategory("Gas");
    expect(screen.getByText("Add $12.50")).toBeTruthy();
    // The pick is shown with its direction, and a note field appears with it.
    expect(screen.getByText("Gas")).toBeTruthy();
    expect(screen.getByText("Expense")).toBeTruthy();
    expect(noteInput()).toBeTruthy();
  });

  it("sanitizes the amount to digits, one dot and two decimals", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await typeAmount("1a2.3.456");
    expect(amountInput().props.value).toBe("12.34");
  });

  it("shows thousands separators in the amount input", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await typeAmount("1234567.89");
    expect(amountInput().props.value).toBe("1,234,567.89");
  });

  it("switches to LBP and shows the USD estimate plus grouped label", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await fireEvent.press(screen.getByLabelText("Switch currency"));
    expect(screen.getByText("LL")).toBeTruthy(); // the amount field's symbol
    await typeAmount("895000");
    expect(screen.getByText("≈ $10.00")).toBeTruthy();
    await chooseCategory("Gas");
    expect(screen.getByText("Add 895,000 LBP")).toBeTruthy();
  });

  it("groups large LBP amounts with decimals in the CTA", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await fireEvent.press(screen.getByLabelText("Switch currency"));
    await typeAmount("1234567.5");
    await chooseCategory("Gas");
    expect(screen.getByText("Add 1,234,567.5 LBP")).toBeTruthy();
  });

  it("toggles the currency back and forth", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    const toggle = screen.getByLabelText("Switch currency");
    await fireEvent.press(toggle); // USD → LBP
    expect(screen.getByText("LBP")).toBeTruthy();
    await fireEvent.press(toggle); // LBP → USD
    expect(screen.getByText("USD")).toBeTruthy();
    // With no amount entered there is no conversion line to show.
    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it("closes the category sheet when the scrim is tapped", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await fireEvent.press(screen.getByText("Add Category"));
    expect(screen.getByText("Groceries")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(screen.queryByText("Groceries")).toBeNull();
  });

  it("saves a new transaction, reports it and resets the form", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await typeAmount("10");
    await chooseCategory("Gas");
    await fireEvent.changeText(noteInput(), "  fuel  ");
    await fireEvent.press(screen.getByText("Add $10.00"));

    expect(mockStore.addTransaction).toHaveBeenCalledWith({
      is_income: false,
      category: "gas",
      amount_usd_cents: 1000,
      original_currency: "USD",
      original_amount: 10,
      rate_used: 89500,
      note: "fuel",
    });
    expect(posthog.capture).toHaveBeenCalledWith("transaction_added", {
      category: "gas",
      is_income: false,
      currency: "USD",
    });
    // Form resets back to the empty state.
    expect(screen.getByText("Enter an amount")).toBeTruthy();
    expect(screen.getByText("Add Category")).toBeTruthy();
  });

  it("stores a null note when left blank", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await typeAmount("5");
    await chooseCategory("Gas");
    await fireEvent.press(screen.getByText("Add $5.00"));
    expect(mockStore.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
    );
  });

  it("resets the category when the direction changes", async () => {
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await typeAmount("5");
    await chooseCategory("Gas");
    expect(screen.getByText("Gas")).toBeTruthy();

    // Reopen the sheet and flip to income — the category should clear.
    await fireEvent.press(screen.getByText("Change ›"));
    await fireEvent.press(screen.getByText("In"));
    expect(screen.getByText("Choose a category")).toBeTruthy();
    // …and the sheet now offers income categories.
    await fireEvent.press(screen.getByText("Add Category"));
    await fireEvent.press(screen.getByText("Salary"));
    expect(screen.getByText("Income")).toBeTruthy();
    expect(screen.getByText("Add $5.00")).toBeTruthy();
  });

  it("shows the error returned by the store and keeps the input", async () => {
    mockStore.addTransaction.mockImplementation(async () => ({
      error: "Server said no",
    }));
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await typeAmount("5");
    await chooseCategory("Gas");
    await fireEvent.press(screen.getByText("Add $5.00"));

    expect(screen.getByText("Server said no")).toBeTruthy();
    expect(amountInput().props.value).toBe("5");
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("shows a Saving… state while the save is in flight", async () => {
    // What the CTA says while the store is still working, sampled from inside
    // the call itself (after a tick, so the re-render has landed).
    let ctaWhileSaving: string | null = null;
    mockStore.addTransaction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 0));
      ctaWhileSaving = screen.queryByText("Saving…") ? "Saving…" : null;
      return { error: null };
    });
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await typeAmount("5");
    await chooseCategory("Gas");
    await fireEvent.press(screen.getByText("Add $5.00"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(ctaWhileSaving).toBe("Saving…");
    expect(screen.getByText("Enter an amount")).toBeTruthy();
  });

  it("does nothing when the disabled CTA's handler fires", async () => {
    // The CTA is disabled until there is an amount and a category, so this
    // guard can't be reached by pressing it — the press never lands. It is
    // asserted here for what it promises: nothing is saved either way.
    await render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await fireEvent.press(screen.getByText("Enter an amount"));
    expect(mockStore.addTransaction).not.toHaveBeenCalled();
  });
});

describe("AddComposer (edit mode)", () => {
  it("prefills from the editing transaction and saves an update", async () => {
    const onClearEdit = jest.fn();
    await render(<AddComposer editing={tx()} onClearEdit={onClearEdit} />);
    expect(amountInput().props.value).toBe("50");
    expect(screen.getByText("Salary")).toBeTruthy();
    expect(screen.getByText("Income")).toBeTruthy();
    expect(noteInput().props.value).toBe("paycheck");

    await fireEvent.press(screen.getByText("Save $50.00"));
    expect(mockStore.updateTransaction).toHaveBeenCalledWith("edit1", {
      is_income: true,
      category: "salary",
      amount_usd_cents: 5000,
      original_currency: "USD",
      original_amount: 50,
      rate_used: 89500,
      note: "paycheck",
    });
    expect(posthog.capture).toHaveBeenCalledWith("transaction_updated", {
      category: "salary",
      is_income: true,
      currency: "USD",
    });
    expect(onClearEdit).toHaveBeenCalled();
  });

  it("keeps the edit open and shows the error when the update fails", async () => {
    const onClearEdit = jest.fn();
    mockStore.updateTransaction.mockImplementation(async () => ({
      error: "Nope",
    }));
    await render(<AddComposer editing={tx()} onClearEdit={onClearEdit} />);
    await fireEvent.press(screen.getByText("Save $50.00"));
    expect(screen.getByText("Nope")).toBeTruthy();
    expect(onClearEdit).not.toHaveBeenCalled();
  });

  it("can cancel an edit", async () => {
    const onClearEdit = jest.fn();
    await render(<AddComposer editing={tx()} onClearEdit={onClearEdit} />);
    await fireEvent.press(screen.getByText("Cancel edit"));
    expect(onClearEdit).toHaveBeenCalled();
  });

  it("clears the editing note when it was null", async () => {
    await render(<AddComposer editing={tx({ note: null })} onClearEdit={() => {}} />);
    expect(noteInput().props.value).toBe("");
  });

  it("goes back to an empty form when the edit is cleared", async () => {
    const view = await render(
      <AddComposer
        editing={tx({ original_currency: "LBP", original_amount: 8950 })}
        onClearEdit={() => {}}
      />,
    );
    expect(screen.getByText("Cancel edit")).toBeTruthy();
    expect(screen.getByText("LBP")).toBeTruthy();

    await view.rerender(<AddComposer editing={null} onClearEdit={() => {}} />);
    expect(screen.queryByText("Cancel edit")).toBeNull();
    expect(screen.getByText("Enter an amount")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
    expect(amountInput().props.value).toBe("");
  });
});
