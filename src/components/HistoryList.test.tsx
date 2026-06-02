import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

import { HistoryList } from "@/components/HistoryList";
import { getMotionNode, pan, fling } from "@/test/motion";
import type { Transaction } from "@/types/db";

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

describe("HistoryList", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the empty state with no rows", () => {
    render(<HistoryList rows={[]} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/Nothin' here yet/)).toBeInTheDocument();
  });

  it("renders an expense row with a minus and the date", () => {
    render(
      <HistoryList rows={[tx({ note: "Milk" })]} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.getByText("Jun 1")).toBeInTheDocument();
    expect(screen.getByText(/^-/)).toHaveTextContent("-$12.50");
  });

  it("renders an income row with a plus and an LBP marker", () => {
    render(
      <HistoryList
        rows={[tx({ is_income: true, original_currency: "LBP" })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/^\+/)).toHaveTextContent("+$12.50");
    expect(screen.getByText(/· LBP/)).toBeInTheDocument();
  });

  it("fires edit and delete callbacks", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const row = tx();
    render(<HistoryList rows={[row]} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(row);
  });

  it("handles swipe gestures (open both ways, snap back, swallow click)", () => {
    const { container } = render(
      <HistoryList rows={[tx()]} onEdit={() => {}} onDelete={() => {}} />,
    );
    const node = getMotionNode(container);

    // Swipe right (reveal edit), then auto-close after the timeout.
    act(() => node.__motion.onDragEnd?.({}, fling(1000)));
    act(() => vi.advanceTimersByTime(2000));

    // Swipe left (reveal delete); a tap (not moved) snaps it closed again.
    act(() => node.__motion.onDragEnd?.({}, fling(-1000)));
    fireEvent.click(node);

    // From closed, a small flick settles in the middle → snap back to 0.
    act(() => node.__motion.onDragEnd?.({}, fling(0)));

    // A real drag marks moved, so the following click is swallowed.
    act(() => node.__motion.onDragStart?.({}, pan(0)));
    act(() => node.__motion.onDrag?.({}, pan(20)));
    fireEvent.click(node);

    // A sub-threshold drag does not mark moved; the click is a no-op at rest.
    act(() => node.__motion.onDrag?.({}, pan(2)));
    fireEvent.click(node);
  });
});
