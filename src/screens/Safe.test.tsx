import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import type { SafeGoldEntry, Transaction } from "@/types/db";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

const { fetchGoldUsdPerGram } = vi.hoisted(() => ({
  fetchGoldUsdPerGram: vi.fn(async () => null as number | null),
}));
vi.mock("@/lib/gold", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gold")>("@/lib/gold");
  return { ...actual, fetchGoldUsdPerGram };
});

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

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

describe("Safe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeValue = makeStoreValue();
    fetchGoldUsdPerGram.mockResolvedValue(null);
  });

  it("shows totals and a gold-price-unavailable note", async () => {
    storeValue = makeStoreValue({ safeTotalCents: 5000, safeGoldGrams: 3 });
    render(<Safe />);
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("3 g")).toBeInTheDocument();
    expect(
      await screen.findByText(/live price unavailable/),
    ).toBeInTheDocument();
  });

  it("shows a live gold valuation when the price loads", async () => {
    fetchGoldUsdPerGram.mockResolvedValue(100); // $100 / gram
    storeValue = makeStoreValue({ safeGoldGrams: 2 });
    render(<Safe />);
    expect(await screen.findByText(/≈ \$200\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$100\.00\/g \(live\)/)).toBeInTheDocument();
  });

  it("ignores a gold price that resolves after unmount", async () => {
    // The effect guards setState with an `active` flag cleared on cleanup; a
    // price arriving after unmount must be dropped (no setState-after-unmount).
    let resolve!: (v: number | null) => void;
    fetchGoldUsdPerGram.mockReturnValueOnce(
      new Promise<number | null>((r) => {
        resolve = r;
      }),
    );
    const { unmount } = render(<Safe />);
    unmount(); // cleanup sets active = false
    await act(async () => {
      resolve(100); // .then runs now; active is false → setGoldPerGram skipped
    });
  });

  it("colors a negative cash balance differently", () => {
    storeValue = makeStoreValue({ safeTotalCents: -1500 });
    render(<Safe />);
    expect(screen.getByText("-$15.00")).toBeInTheDocument();
  });

  it("navigates back home", async () => {
    render(<Safe />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("adds cash to the safe (deposit → expense)", async () => {
    render(<Safe />);
    await userEvent.type(screen.getByLabelText("Amount"), "25");
    await userEvent.click(screen.getByRole("button", { name: /Add \$25\.00 to safe/ }));
    expect(storeValue.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        is_income: false,
        category: "safe",
        amount_usd_cents: 2500,
      }),
    );
  });

  it("takes cash out of the safe (withdraw → income) with a note", async () => {
    render(<Safe />);
    await userEvent.click(screen.getByRole("button", { name: /Take out/ }));
    await userEvent.type(screen.getByLabelText("Amount"), "10");
    await userEvent.type(screen.getByLabelText("Note"), "groceries");
    await userEvent.click(screen.getByRole("button", { name: /Take \$10\.00 out/ }));
    expect(storeValue.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ is_income: true, note: "groceries" }),
    );
  });

  it("shows the LBP estimate and grouped CTA for cash entered in LBP", async () => {
    render(<Safe />);
    await userEvent.click(screen.getByRole("button", { name: "Switch currency" }));
    await userEvent.type(screen.getByLabelText("Amount"), "1234567.5");
    expect(screen.getByText(/≈ \$13\.79/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add 1,234,567\.5 LBP to safe/ }),
    ).toBeInTheDocument();
  });

  it("toggles the currency back and forth", async () => {
    render(<Safe />);
    const toggle = screen.getByRole("button", { name: "Switch currency" });
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("LBP");
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("USD");
  });

  it("switches between Gold and Cash, and between Add and Take out", async () => {
    render(<Safe />);
    await userEvent.click(screen.getByRole("button", { name: /Gold/ }));
    expect(screen.getByLabelText("Grams")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cash/ }));
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    // Toggle Take out then back to Add.
    await userEvent.click(screen.getByRole("button", { name: /Take out/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    expect(screen.getByText("Enter an amount")).toBeInTheDocument();
  });

  it("switches to gold and saves a gold deposit, with a live estimate", async () => {
    fetchGoldUsdPerGram.mockResolvedValue(100);
    render(<Safe />);
    await userEvent.click(screen.getByRole("button", { name: /Gold/ }));
    expect(screen.getByText("Enter an amount of gold")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Grams"), "1.5");
    await waitFor(() =>
      expect(screen.getByText(/at the live price/)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: /Add 1\.5 g to safe/ }));
    expect(storeValue.addSafeGoldEntry).toHaveBeenCalledWith(
      expect.objectContaining({ is_deposit: true, grams: 1.5 }),
    );
  });

  it("clamps cash amounts to two decimals", async () => {
    render(<Safe />);
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    await userEvent.type(amount, "12.9a99");
    expect(amount.value).toBe("12.99");
  });

  it("shows thousands separators in the cash amount input as you type", async () => {
    render(<Safe />);
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    await userEvent.type(amount, "1234567.89");
    expect(amount.value).toBe("1,234,567.89");
  });

  it("clamps grams to three decimals", async () => {
    render(<Safe />);
    await userEvent.click(screen.getByRole("button", { name: /Gold/ }));
    const grams = screen.getByLabelText("Grams") as HTMLInputElement;
    await userEvent.type(grams, "1.23456");
    expect(grams.value).toBe("1.234");
  });

  it("surfaces a save error", async () => {
    storeValue = makeStoreValue({
      addTransaction: vi.fn(async () => ({ error: "vault jammed" })),
    });
    render(<Safe />);
    await userEvent.type(screen.getByLabelText("Amount"), "5");
    await userEvent.click(screen.getByRole("button", { name: /Add \$5\.00 to safe/ }));
    expect(await screen.findByText("vault jammed")).toBeInTheDocument();
  });

  it("shows a Saving… state while in flight", async () => {
    let resolve!: (v: { error: null }) => void;
    storeValue = makeStoreValue({
      addTransaction: vi.fn(() => new Promise<{ error: null }>((r) => (resolve = r))),
    });
    render(<Safe />);
    await userEvent.type(screen.getByLabelText("Amount"), "5");
    await userEvent.click(screen.getByRole("button", { name: /Add \$5\.00 to safe/ }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
    act(() => resolve({ error: null }));
    await waitFor(() =>
      expect(screen.getByText("Enter an amount")).toBeInTheDocument(),
    );
  });

  it("renders the empty history state", () => {
    render(<Safe />);
    expect(screen.getByText(/Nothin' in the safe yet/)).toBeInTheDocument();
  });

  it("lists cash and gold movements and deletes them on confirm", async () => {
    storeValue = makeStoreValue({
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Safe />);

    expect(screen.getByText("Added cash")).toBeInTheDocument();
    expect(screen.getByText("Took out cash")).toBeInTheDocument();
    expect(screen.getByText("rainy day")).toBeInTheDocument();
    expect(screen.getByText("Took out gold")).toBeInTheDocument();
    expect(screen.getByText("Added gold")).toBeInTheDocument();
    expect(screen.getByText(/· LBP/)).toBeInTheDocument();

    const deletes = screen.getAllByRole("button", { name: "Delete" });
    await userEvent.click(deletes[0]); // newest first = the cash move
    expect(storeValue.deleteTransaction).toHaveBeenCalledWith("c1");
    confirmSpy.mockRestore();
  });

  it("deletes a gold movement on confirm", async () => {
    storeValue = makeStoreValue({ safeGoldEntries: [goldEntry()] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Safe />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(storeValue.deleteSafeGoldEntry).toHaveBeenCalledWith("g1");
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirm is dismissed", async () => {
    storeValue = makeStoreValue({ safeGoldEntries: [goldEntry()] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Safe />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(storeValue.deleteSafeGoldEntry).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("obscures totals and movements, and blocks saving, while locked", async () => {
    storeValue = makeStoreValue({
      locked: true,
      transactions: [cashTx({ amountMask: "ab12" })],
      safeGoldEntries: [goldEntry({ gramsMask: "cd34" })],
      safeTotalCents: 0,
      safeGoldGrams: 0,
    });
    render(<Safe />);
    // Totals obscured.
    expect(screen.getByText("$•••••")).toBeInTheDocument();
    expect(screen.getByText("••••")).toBeInTheDocument();
    expect(
      screen.getByText("Locked — unlock in Settings to see the safe."),
    ).toBeInTheDocument();
    // Movements obscured (mask shown instead of the real amount).
    expect(screen.getByText("+$ab12")).toBeInTheDocument();
    expect(screen.getByText("+cd34")).toBeInTheDocument();
    // The composer can't save while locked.
    expect(
      screen.getByRole("button", { name: "Unlock in Settings to move money" }),
    ).toBeDisabled();
  });
});
