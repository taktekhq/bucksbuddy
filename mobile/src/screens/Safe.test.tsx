// Adapted from the web's src/screens/Safe.test.tsx. Same cases; typing goes
// through `changeText`, `window.confirm` is `Alert.alert` (PORTING §1 — the
// confirm branch runs in the destructive button's onPress), and disabled
// buttons are proven inert by pressing them rather than by an attribute.
import { Alert } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import posthog from "@/lib/posthog";
import type { SafeGoldEntry, Transaction } from "@/types/db";

// Rendering a whole screen (and the modules it drags in) can outrun jest's
// 5s default on a cold, loaded machine — see TESTING.md.
jest.setTimeout(30000);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Reanimated's own mock pulls in the real module, whose worklets runtime isn't
// available off-device. No JSX in the factory: nativewind's babel plugin would
// rewrite it into an out-of-scope import that jest refuses.
jest.mock("react-native-reanimated", () => {
  const RN = require("react-native");
  const animation = {
    duration: () => animation,
    delay: () => animation,
    springify: () => animation,
  };
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    ScrollView: RN.ScrollView,
    createAnimatedComponent: (Component: unknown) => Component,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useAnimatedScrollHandler: (fn: unknown) => fn,
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    runOnJS: (fn: unknown) => fn,
    Easing: { bezier: () => ({}) },
    FadeIn: animation,
    FadeOut: animation,
    LinearTransition: animation,
  };
});

// Gesture Handler needs a worklets runtime too; the swipe itself isn't what
// these tests drive (the Delete action is a plain button).
jest.mock("react-native-gesture-handler", () => {
  const RN = require("react-native");
  const chainable: unknown = new Proxy({}, { get: () => () => chainable });
  return {
    __esModule: true,
    Gesture: new Proxy({}, { get: () => () => chainable }),
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: RN.View,
    Directions: {},
    State: {},
  };
});

const mockFetchGoldUsdPerGram = jest.fn(async () => null as number | null);
jest.mock("@/lib/gold", () => ({
  ...jest.requireActual("@/lib/gold"),
  fetchGoldUsdPerGram: (...a: unknown[]) => (mockFetchGoldUsdPerGram as (...x: unknown[]) => unknown)(...a),
}));

function makeStoreValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    transactions: [] as Transaction[],
    lbpPerUsd: DEFAULT_LBP_PER_USD,
    balanceCents: 0,
    monthlyNetCents: 0,
    addTransaction: jest.fn(async (..._a: unknown[]) => ({ error: null as string | null })),
    updateTransaction: jest.fn(async () => ({ error: null })),
    deleteTransaction: jest.fn(async (..._a: unknown[]) => ({ error: null })),
    setRate: jest.fn(async () => ({ error: null })),
    e2eMode: "default",
    locked: false,
    passphrase: null,
    unlock: jest.fn(async () => ({ error: null })),
    enableEncryption: jest.fn(async () => ({ error: null })),
    disableEncryption: jest.fn(async () => ({ error: null })),
    signOut: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => ({ error: null })),
    safeTotalCents: 0,
    safeGoldEntries: [] as SafeGoldEntry[],
    safeGoldGrams: 0,
    addSafeGoldEntry: jest.fn(async (..._a: unknown[]) => ({ error: null as string | null })),
    deleteSafeGoldEntry: jest.fn(async (..._a: unknown[]) => ({ error: null })),
    refresh: jest.fn(async () => {}),
    ...overrides,
  };
}

let mockStoreValue = makeStoreValue();
jest.mock("@/lib/store", () => ({ useStore: () => mockStoreValue }));

const mockNavigate = jest.fn();
jest.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => (mockNavigate as (...x: unknown[]) => unknown)(...a) }));

import { Safe } from "@/screens/Safe";

function cashTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "c1",
    user_id: "u1",
    is_income: false, // out → deposit to safe
    category: "safe",
    amount_usd_cents: 5000,
    original_currency: "USD",
    original_amount: 50,
    rate_used: 89500,
    occurred_at: "2026-06-02T10:00:00.000Z",
    note: "rainy day",
    created_at: "2026-06-02T10:00:00.000Z",
    ...overrides,
  };
}

function goldEntry(overrides: Partial<SafeGoldEntry> = {}): SafeGoldEntry {
  return {
    id: "g1",
    user_id: "u1",
    is_deposit: true,
    grams: 3,
    note: null,
    occurred_at: "2026-06-01T10:00:00.000Z",
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

// "Cash" and "Gold" each label the totals card *and* the composer's asset
// selector; the selector is the second of the pair.
const assetTab = (name: "Cash" | "Gold") => screen.getAllByText(name)[1];

async function tapAlertButton(spy: jest.SpyInstance, text: string) {
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as {
    text?: string;
    onPress?: () => void | Promise<void>;
  }[];
  await buttons.find((b) => b.text === text)?.onPress?.();
}

describe("Safe", () => {
  beforeEach(() => {
    mockStoreValue = makeStoreValue();
    mockFetchGoldUsdPerGram.mockResolvedValue(null);
  });

  it("shows totals and a gold-price-unavailable note", async () => {
    mockStoreValue = makeStoreValue({ safeTotalCents: 5000, safeGoldGrams: 3 });
    await render(<Safe />);
    expect(screen.getByText("$50.00")).toBeOnTheScreen();
    expect(screen.getByText("3 g")).toBeOnTheScreen();
    expect(await screen.findByText(/live price unavailable/)).toBeOnTheScreen();
  });

  it("shows a live gold valuation when the price loads", async () => {
    mockFetchGoldUsdPerGram.mockResolvedValue(100); // $100 / gram
    mockStoreValue = makeStoreValue({ safeGoldGrams: 2 });
    await render(<Safe />);
    expect(await screen.findByText(/≈ \$200\.00/)).toBeOnTheScreen();
    expect(screen.getByText(/\$100\.00\/g \(live\)/)).toBeOnTheScreen();
  });

  it("ignores a gold price that resolves after unmount", async () => {
    // The effect guards setState with an `active` flag cleared on cleanup; a
    // price arriving after unmount must be dropped.
    let resolve!: (v: number | null) => void;
    mockFetchGoldUsdPerGram.mockReturnValueOnce(
      new Promise<number | null>((r) => {
        resolve = r;
      }),
    );
    const view = await render(<Safe />);
    await view.unmount(); // cleanup sets active = false
    await act(async () => {
      resolve(100); // .then runs now; active is false → setGoldPerGram skipped
    });
  });

  it("colors a negative cash balance differently", async () => {
    mockStoreValue = makeStoreValue({ safeTotalCents: -1500 });
    await render(<Safe />);
    expect(screen.getByText("-$15.00")).toBeOnTheScreen();
  });

  it("navigates back home", async () => {
    await render(<Safe />);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("adds cash to the safe (deposit → expense)", async () => {
    await render(<Safe />);
    await fireEvent.changeText(screen.getByLabelText("Amount"), "25");
    await fireEvent.press(screen.getByText("Add $25.00 to safe"));
    expect(mockStoreValue.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        is_income: false,
        category: "safe",
        amount_usd_cents: 2500,
        note: null,
      }),
    );
    expect(posthog.capture).toHaveBeenCalledWith("safe_cash_deposited", {
      currency: "USD",
    });
  });

  it("takes cash out of the safe (withdraw → income) with a note", async () => {
    await render(<Safe />);
    await fireEvent.press(screen.getByText("Take out"));
    await fireEvent.changeText(screen.getByLabelText("Amount"), "10");
    await fireEvent.changeText(screen.getByLabelText("Note"), " groceries ");
    await fireEvent.press(screen.getByText("Take $10.00 out"));
    expect(mockStoreValue.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ is_income: true, note: "groceries" }),
    );
    expect(posthog.capture).toHaveBeenCalledWith("safe_cash_withdrawn", {
      currency: "USD",
    });
  });

  it("shows the LBP estimate and grouped CTA for cash entered in LBP", async () => {
    await render(<Safe />);
    await fireEvent.press(screen.getByLabelText("Switch currency"));
    await fireEvent.changeText(screen.getByLabelText("Amount"), "1234567.5");
    expect(screen.getByText(/≈ \$13\.79/)).toBeOnTheScreen();
    expect(screen.getByText("Add 1,234,567.5 LBP to safe")).toBeOnTheScreen();
  });

  it("toggles the currency back and forth", async () => {
    await render(<Safe />);
    const toggle = screen.getByLabelText("Switch currency");
    await fireEvent.press(toggle);
    expect(screen.getByText("LBP")).toBeOnTheScreen();
    await fireEvent.press(toggle);
    expect(screen.getByText("USD")).toBeOnTheScreen();
  });

  it("switches between Gold and Cash, and between Add and Take out", async () => {
    await render(<Safe />);
    await fireEvent.press(assetTab("Gold"));
    expect(screen.getByLabelText("Grams")).toBeOnTheScreen();
    await fireEvent.press(assetTab("Cash"));
    expect(screen.getByLabelText("Amount")).toBeOnTheScreen();
    // Toggle Take out then back to Add.
    await fireEvent.press(screen.getByText("Take out"));
    await fireEvent.press(screen.getByText("Add"));
    expect(screen.getByText("Enter an amount")).toBeOnTheScreen();
  });

  it("switches to gold and saves a gold deposit, with a live estimate", async () => {
    mockFetchGoldUsdPerGram.mockResolvedValue(100);
    await render(<Safe />);
    await fireEvent.press(assetTab("Gold"));
    expect(screen.getByText("Enter an amount of gold")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Grams"), "1.5");
    expect(await screen.findByText(/at the live price/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Add 1.5 g to safe"));
    expect(mockStoreValue.addSafeGoldEntry).toHaveBeenCalledWith(
      expect.objectContaining({ is_deposit: true, grams: 1.5 }),
    );
    expect(posthog.capture).toHaveBeenCalledWith("safe_gold_deposited");
  });

  it("saves a gold withdrawal", async () => {
    await render(<Safe />);
    await fireEvent.press(assetTab("Gold"));
    await fireEvent.press(screen.getByText("Take out"));
    await fireEvent.changeText(screen.getByLabelText("Grams"), "2");
    await fireEvent.press(screen.getByText("Take 2 g out"));
    expect(mockStoreValue.addSafeGoldEntry).toHaveBeenCalledWith(
      expect.objectContaining({ is_deposit: false, grams: 2 }),
    );
    expect(posthog.capture).toHaveBeenCalledWith("safe_gold_withdrawn");
  });

  it("clamps cash amounts to two decimals", async () => {
    await render(<Safe />);
    const amount = screen.getByLabelText("Amount");
    await fireEvent.changeText(amount, "12.9a99");
    expect(screen.getByLabelText("Amount").props.value).toBe("12.99");
  });

  it("shows thousands separators in the cash amount input as you type", async () => {
    await render(<Safe />);
    await fireEvent.changeText(screen.getByLabelText("Amount"), "1234567.89");
    expect(screen.getByLabelText("Amount").props.value).toBe("1,234,567.89");
  });

  it("clamps grams to three decimals", async () => {
    await render(<Safe />);
    await fireEvent.press(assetTab("Gold"));
    await fireEvent.changeText(screen.getByLabelText("Grams"), "1.23456");
    expect(screen.getByLabelText("Grams").props.value).toBe("1.234");
  });

  it("shrugs off an amount too big to be a number", async () => {
    await render(<Safe />);
    // parseFloat overflows to Infinity; the composer treats it as nothing
    // entered rather than charting a bogus figure.
    await fireEvent.changeText(screen.getByLabelText("Amount"), "9".repeat(400));
    await fireEvent.press(assetTab("Gold"));
    expect(screen.getByText("Enter an amount of gold")).toBeOnTheScreen();
  });

  it("does nothing until there's an amount to move", async () => {
    await render(<Safe />);
    await fireEvent.press(screen.getByText("Enter an amount"));
    expect(mockStoreValue.addTransaction).not.toHaveBeenCalled();
  });

  it("surfaces a save error", async () => {
    mockStoreValue = makeStoreValue({
      addTransaction: jest.fn(async () => ({ error: "vault jammed" })),
    });
    await render(<Safe />);
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5");
    await fireEvent.press(screen.getByText("Add $5.00 to safe"));
    expect(screen.getByText("vault jammed")).toBeOnTheScreen();
  });

  it("shows a Saving… state while in flight", async () => {
    mockStoreValue = makeStoreValue({
      addTransaction: jest.fn(async () => {
        // Let React paint the busy CTA before the call settles.
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(screen.getByText("Saving…")).toBeOnTheScreen();
        return { error: null };
      }),
    });
    await render(<Safe />);
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5");
    await fireEvent.press(screen.getByText("Add $5.00 to safe"));
    // The field is cleared once it lands.
    expect(screen.getByText("Enter an amount")).toBeOnTheScreen();
  });

  it("renders the empty history state", async () => {
    await render(<Safe />);
    expect(screen.getByText(/Nothin' in the safe yet/)).toBeOnTheScreen();
  });

  it("lists cash and gold movements and deletes them on confirm", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [
        cashTx({ original_currency: "LBP" }), // deposit (newest)
        cashTx({
          id: "c2",
          is_income: true, // take-out
          note: null,
          occurred_at: "2026-05-30T10:00:00.000Z",
        }),
      ],
      safeGoldEntries: [
        goldEntry({ is_deposit: false }),
        goldEntry({ id: "g2", is_deposit: true, note: "coins" }),
      ],
    });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Safe />);

    expect(screen.getByText("Added cash")).toBeOnTheScreen();
    expect(screen.getByText("Took out cash")).toBeOnTheScreen();
    expect(screen.getByText("rainy day")).toBeOnTheScreen();
    expect(screen.getByText("Took out gold")).toBeOnTheScreen();
    expect(screen.getByText("Added gold")).toBeOnTheScreen();
    expect(screen.getByText("coins")).toBeOnTheScreen();
    expect(screen.getByText(/· LBP/)).toBeOnTheScreen();

    const deletes = screen.getAllByLabelText("Delete");
    await fireEvent.press(deletes[0]); // newest first = the cash move
    expect(alert).toHaveBeenCalledWith(
      "Delete this safe movement?",
      undefined,
      expect.any(Array),
    );
    await tapAlertButton(alert, "Delete");
    expect(mockStoreValue.deleteTransaction).toHaveBeenCalledWith("c1");
    alert.mockRestore();
  });

  it("deletes a gold movement on confirm", async () => {
    mockStoreValue = makeStoreValue({ safeGoldEntries: [goldEntry()] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Safe />);
    await fireEvent.press(screen.getByLabelText("Delete"));
    await tapAlertButton(alert, "Delete");
    expect(mockStoreValue.deleteSafeGoldEntry).toHaveBeenCalledWith("g1");
    alert.mockRestore();
  });

  it("does not delete when the confirm is dismissed", async () => {
    mockStoreValue = makeStoreValue({ safeGoldEntries: [goldEntry()] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Safe />);
    await fireEvent.press(screen.getByLabelText("Delete"));
    await tapAlertButton(alert, "Cancel");
    expect(mockStoreValue.deleteSafeGoldEntry).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("obscures totals and movements, and blocks saving, while locked", async () => {
    mockStoreValue = makeStoreValue({
      locked: true,
      transactions: [cashTx({ amountMask: "ab12" })],
      safeGoldEntries: [goldEntry({ gramsMask: "cd34" })],
      safeTotalCents: 0,
      safeGoldGrams: 0,
    });
    await render(<Safe />);
    // Totals obscured.
    expect(screen.getByText("$•••••")).toBeOnTheScreen();
    expect(screen.getByText("••••")).toBeOnTheScreen();
    expect(screen.getByText("Locked — unlock in Settings to see the safe.")).toBeOnTheScreen();
    // Movements obscured (mask shown instead of the real amount).
    expect(screen.getByText("+$ab12")).toBeOnTheScreen();
    expect(screen.getByText("+cd34")).toBeOnTheScreen();
    // The composer can't save while locked.
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5");
    await fireEvent.press(screen.getByText("Unlock in Settings to move money"));
    expect(mockStoreValue.addTransaction).not.toHaveBeenCalled();
  });
});
