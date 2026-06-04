import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { makeStoreValue } from "@/test/storeValue";
import type { Transaction } from "@/types/db";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

import { History } from "@/screens/History";
import { takePendingEdit } from "@/lib/editIntent";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1250,
    original_currency: "USD",
    original_amount: 12.5,
    rate_used: 89500,
    occurred_at: "2026-06-01T10:00:00.000Z",
    note: null,
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    storeValue = makeStoreValue();
    takePendingEdit(); // drain any leftover intent between tests
  });
  afterEach(() => vi.useRealTimers());

  it("shows an empty message when there's no history", () => {
    render(<History />);
    expect(screen.getByText("Nothin' here yet, Doc.")).toBeInTheDocument();
  });

  it("renders a stack per category and a plain row for singles", () => {
    storeValue = makeStoreValue({
      transactions: [
        tx({ id: "a", category: "gas" }),
        tx({ id: "b", category: "coffee" }),
        tx({ id: "c", category: "coffee" }),
      ],
    });
    render(<History />);
    expect(screen.getByText("All History")).toBeInTheDocument();
    // Coffee has two entries → a stack; Gas has one → a plain row.
    expect(screen.getByRole("button", { name: /Coffee, 2 entries/ })).toBeInTheDocument();
    expect(screen.getByText("Gas")).toBeInTheDocument();
  });

  it("goes back home from the back button", () => {
    render(<History />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("stashes the edit target and navigates home", () => {
    storeValue = makeStoreValue({ transactions: [tx({ id: "t1" })] });
    render(<History />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(navigate).toHaveBeenCalledWith("/");
    expect(takePendingEdit()).toBe("t1");
  });

  it("deletes a row when confirmed, and not when cancelled", () => {
    storeValue = makeStoreValue({ transactions: [tx({ id: "t1" })] });
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<History />);

    confirmSpy.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(storeValue.deleteTransaction).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(storeValue.deleteTransaction).toHaveBeenCalledWith("t1");
    confirmSpy.mockRestore();
  });
});
