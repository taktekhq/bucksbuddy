// Adapted from the web's src/screens/Receipts.test.tsx — same assertions, with
// the hash-router checks becoming `navigate` calls.
import { render, screen, fireEvent } from "@testing-library/react-native";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import { monthLabel } from "@/lib/dates";
import type { Transaction } from "@/types/db";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function makeStoreValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    transactions: [] as Transaction[],
    lbpPerUsd: DEFAULT_LBP_PER_USD,
    balanceCents: 0,
    monthlyNetCents: 0,
    addTransaction: jest.fn(async () => ({ error: null })),
    updateTransaction: jest.fn(async () => ({ error: null })),
    deleteTransaction: jest.fn(async () => ({ error: null })),
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
    safeGoldEntries: [],
    safeGoldGrams: 0,
    addSafeGoldEntry: jest.fn(async () => ({ error: null })),
    deleteSafeGoldEntry: jest.fn(async () => ({ error: null })),
    refresh: jest.fn(async () => {}),
    ...overrides,
  };
}

let mockStoreValue = makeStoreValue();
jest.mock("@/lib/store", () => ({ useStore: () => mockStoreValue }));

const mockNavigate = jest.fn();
jest.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => mockNavigate(...a) }));

// The month-scoped filters are unit-tested in lib/stats.test.ts; mocking them
// keeps these fixtures independent of today's date and weekday.
const mockTreatTransactions = jest.fn();
const mockWeekendTransactions = jest.fn();
jest.mock("@/lib/stats", () => ({
  treatTransactions: (...a: unknown[]) => mockTreatTransactions(...a),
  weekendTransactions: (...a: unknown[]) => mockWeekendTransactions(...a),
}));

import { Receipts } from "@/screens/Receipts";

const receipt = (
  id: string,
  category: string,
  amount_usd_cents: number,
  note: string | null,
) =>
  ({
    id,
    category,
    amount_usd_cents,
    note,
    occurred_at: "2026-06-07T15:00:00.000Z",
  }) as unknown as Transaction;

describe("Receipts", () => {
  beforeEach(() => {
    mockStoreValue = makeStoreValue();
    mockTreatTransactions.mockReturnValue([]);
    mockWeekendTransactions.mockReturnValue([]);
  });

  it("lists this month's treats, read-only, with the total", async () => {
    mockTreatTransactions.mockReturnValue([
      receipt("r1", "self_care/spa", 800, "mani pedi"),
      receipt("r2", "fun/drinks", 500, null),
    ]);
    await render(<Receipts kind="treats" />);
    expect(screen.getByText("Treat Yourself")).toBeOnTheScreen();
    expect(screen.getByText(monthLabel())).toBeOnTheScreen();
    expect(screen.getByText("$13.00")).toBeOnTheScreen();
    expect(screen.getByText("2 entries")).toBeOnTheScreen();
    expect(screen.getByText("Self Care · Spa")).toBeOnTheScreen();
    expect(screen.getByText("mani pedi")).toBeOnTheScreen();
    expect(screen.getByText("Fun · Drinks")).toBeOnTheScreen();
    expect(screen.getByText("$8.00")).toBeOnTheScreen();
    // Read-only: no edit/delete affordances anywhere.
    expect(screen.queryByLabelText("Edit")).toBeNull();
    expect(screen.queryByLabelText("Delete")).toBeNull();
    expect(mockWeekendTransactions).not.toHaveBeenCalled();
  });

  it("lists weekend spending under its own title", async () => {
    mockWeekendTransactions.mockReturnValue([receipt("r1", "gas", 4000, null)]);
    await render(<Receipts kind="weekend" />);
    expect(screen.getByText("Weekend Spend")).toBeOnTheScreen();
    expect(screen.getByText("Gas")).toBeOnTheScreen();
    expect(screen.getByText("1 entry")).toBeOnTheScreen();
    expect(mockTreatTransactions).not.toHaveBeenCalled();
  });

  it("shows the empty line when the month has nothing", async () => {
    await render(<Receipts kind="treats" />);
    expect(screen.getByText(/Nothin' here this month, Doc/)).toBeOnTheScreen();
    expect(screen.getByText("0 entries")).toBeOnTheScreen();
  });

  it("navigates back to Stats", async () => {
    await render(<Receipts kind="treats" />);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/stats");
  });

  it("nudges to Settings instead of listing zeros while locked", async () => {
    mockStoreValue = makeStoreValue({ locked: true });
    await render(<Receipts kind="treats" />);
    expect(screen.getByText(/These entries are encrypted/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(/Enter your passphrase in Settings/));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("treats masked rows as locked (belt and braces)", async () => {
    mockTreatTransactions.mockReturnValue([
      { ...receipt("r1", "fun", 0, null), amountMask: "ab" } as Transaction,
    ]);
    await render(<Receipts kind="treats" />);
    expect(screen.getByText(/These entries are encrypted/)).toBeOnTheScreen();
  });
});
