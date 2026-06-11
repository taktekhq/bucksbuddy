import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import { monthLabel } from "@/lib/dates";
import type { Transaction } from "@/types/db";

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

// The month-scoped filters are unit-tested in lib/stats.test.ts; mocking them
// keeps these fixtures independent of today's date and weekday.
const treatTransactions = vi.fn();
const weekendTransactions = vi.fn();
vi.mock("@/lib/stats", () => ({
  treatTransactions: (...a: unknown[]) => treatTransactions(...a),
  weekendTransactions: (...a: unknown[]) => weekendTransactions(...a),
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
    vi.clearAllMocks();
    storeValue = makeStoreValue();
    treatTransactions.mockReturnValue([]);
    weekendTransactions.mockReturnValue([]);
  });

  it("lists this month's treats, read-only, with the total", () => {
    treatTransactions.mockReturnValue([
      receipt("r1", "self_care/spa", 800, "mani pedi"),
      receipt("r2", "fun/drinks", 500, null),
    ]);
    render(<Receipts kind="treats" />);
    expect(screen.getByText("Treat Yourself")).toBeInTheDocument();
    expect(screen.getByText(monthLabel())).toBeInTheDocument();
    expect(screen.getByText("$13.00")).toBeInTheDocument();
    expect(screen.getByText("2 entries")).toBeInTheDocument();
    expect(screen.getByText("Self Care · Spa")).toBeInTheDocument();
    expect(screen.getByText("mani pedi")).toBeInTheDocument();
    expect(screen.getByText("Fun · Drinks")).toBeInTheDocument();
    expect(screen.getByText("$8.00")).toBeInTheDocument();
    // Read-only: no edit/delete affordances anywhere.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(weekendTransactions).not.toHaveBeenCalled();
  });

  it("lists weekend spending under its own title", () => {
    weekendTransactions.mockReturnValue([receipt("r1", "gas", 4000, null)]);
    render(<Receipts kind="weekend" />);
    expect(screen.getByText("Weekend Spend")).toBeInTheDocument();
    expect(screen.getByText("Gas")).toBeInTheDocument();
    expect(screen.getByText("1 entry")).toBeInTheDocument();
    expect(treatTransactions).not.toHaveBeenCalled();
  });

  it("shows the empty line when the month has nothing", () => {
    render(<Receipts kind="treats" />);
    expect(screen.getByText(/Nothin' here this month, Doc/)).toBeInTheDocument();
    expect(screen.getByText("0 entries")).toBeInTheDocument();
  });

  it("navigates back to Stats", async () => {
    render(<Receipts kind="treats" />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/stats");
  });

  it("nudges to Settings instead of listing zeros while locked", async () => {
    storeValue = makeStoreValue({ locked: true });
    render(<Receipts kind="treats" />);
    expect(screen.getByText(/These entries are encrypted/)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Enter your passphrase in Settings/));
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("treats masked rows as locked (belt and braces)", () => {
    treatTransactions.mockReturnValue([
      { ...receipt("r1", "fun", 0, null), amountMask: "ab" } as Transaction,
    ]);
    render(<Receipts kind="treats" />);
    expect(screen.getByText(/These entries are encrypted/)).toBeInTheDocument();
  });
});
