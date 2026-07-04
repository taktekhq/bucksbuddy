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
    // Pin "now" to mid-June 2026 so the month-scoped "By category" view is
    // deterministic regardless of when the suite runs.
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    localStorage.clear(); // reset the remembered grouping between tests
    storeValue = makeStoreValue();
    takePendingEdit(); // drain any leftover intent between tests
  });
  afterEach(() => vi.useRealTimers());

  it("shows an empty message when there's no history", () => {
    render(<History />);
    expect(screen.getByText("Nothin' here yet, Doc.")).toBeInTheDocument();
    // No grouping toggle to show when there's nothing to group.
    expect(screen.queryByRole("tab", { name: "Timeline" })).not.toBeInTheDocument();
  });

  it("defaults to the timeline view with a day total", () => {
    const today = new Date().toISOString();
    storeValue = makeStoreValue({
      transactions: [tx({ id: "a", category: "gas", occurred_at: today })],
    });
    render(<History />);
    expect(screen.getByText("All History")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Gas")).toBeInTheDocument();
  });

  it("switches to per-category stacks and remembers the choice", () => {
    storeValue = makeStoreValue({
      transactions: [
        tx({ id: "a", category: "gas", occurred_at: "2026-06-10T10:00:00.000Z" }),
        tx({ id: "b", category: "coffee", occurred_at: "2026-06-12T10:00:00.000Z" }),
        tx({ id: "c", category: "coffee", occurred_at: "2026-06-13T10:00:00.000Z" }),
      ],
    });
    const { unmount } = render(<History />);

    fireEvent.click(screen.getByRole("tab", { name: "By category" }));
    // Across-day coffee entries now merge into one stack.
    expect(screen.getByRole("button", { name: /Coffee, 2 entries/ })).toBeInTheDocument();
    expect(screen.getByText("Gas")).toBeInTheDocument();

    // The preference survives a remount.
    unmount();
    render(<History />);
    expect(screen.getByRole("tab", { name: "By category" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("scopes the category view to a month and pages between months", () => {
    storeValue = makeStoreValue({
      transactions: [
        tx({ id: "jun", category: "gas", occurred_at: "2026-06-10T10:00:00.000Z" }),
        tx({ id: "may", category: "coffee", occurred_at: "2026-05-12T10:00:00.000Z" }),
      ],
    });
    render(<History />);
    fireEvent.click(screen.getByRole("tab", { name: "By category" }));

    // Defaults to the current month (June): the June gas shows, May's coffee doesn't.
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText("Gas")).toBeInTheDocument();
    expect(screen.queryByText("Coffee")).not.toBeInTheDocument();

    // Page back a month: now May's coffee shows and June's gas is gone.
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.queryByText("Gas")).not.toBeInTheDocument();

    // Page forward again: back to June, and capped at the present.
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText("Gas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("shows an empty message in the category view for a quiet month", () => {
    storeValue = makeStoreValue({
      transactions: [tx({ id: "may", occurred_at: "2026-05-12T10:00:00.000Z" })],
    });
    render(<History />);
    fireEvent.click(screen.getByRole("tab", { name: "By category" }));
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText("Nothin' logged this month, Doc.")).toBeInTheDocument();
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
