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
    // A plain row has no existing-savings partner.
    expect(onDelete).toHaveBeenCalledWith(row, undefined);
  });

  it("merges an existing-savings pair into one '+' line and deletes both", () => {
    const onDelete = vi.fn();
    const at = "2026-06-02T10:00:00.000Z";
    // Income seed + the Safe deposit it cancels (same amount + timestamp).
    const seed = tx({
      id: "seed1",
      category: "safe_seed",
      is_income: true,
      amount_usd_cents: 100000,
      occurred_at: at,
    });
    const deposit = tx({
      id: "dep1",
      category: "safe",
      is_income: false,
      amount_usd_cents: 100000,
      occurred_at: at,
    });
    render(
      <HistoryList rows={[seed, deposit]} onEdit={() => {}} onDelete={onDelete} />,
    );

    // The seed is hidden; the deposit shows once, labelled and rendered as a +.
    expect(screen.getAllByText("Existing savings")).toHaveLength(1);
    expect(screen.getByText(/^\+/)).toHaveTextContent("+$1,000.00");
    // Paired rows can't be edited (editing one half would desync them).
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    // Deleting the visible row removes its income partner too.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(deposit, seed);
  });

  it("leaves unmatched seeds, take-outs, and non-income seeds as their own rows", () => {
    const orphanSeed = tx({
      id: "seedA",
      category: "safe_seed",
      is_income: true,
      amount_usd_cents: 4200,
      occurred_at: "2026-06-05T10:00:00.000Z",
    });
    const takeOut = tx({
      id: "out1",
      category: "safe",
      is_income: true, // a withdrawal, not a deposit → never paired
      amount_usd_cents: 700,
      occurred_at: "2026-06-04T10:00:00.000Z",
    });
    const weirdSeed = tx({
      id: "seedB",
      category: "safe_seed",
      is_income: false, // a seed that isn't income → ignored by pairing
      amount_usd_cents: 5,
      occurred_at: "2026-06-03T10:00:00.000Z",
    });
    render(
      <HistoryList
        rows={[orphanSeed, takeOut, weirdSeed]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // Nothing is hidden: all three rows render, and an unmatched seed is editable.
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(3);
    expect(screen.getByText("+$42.00")).toBeInTheDocument();
  });

  it("pairs only one deposit per seed when keys collide", () => {
    const at = "2026-06-02T10:00:00.000Z";
    const mk = (id: string, category: string, is_income: boolean) =>
      tx({ id, category, is_income, amount_usd_cents: 100000, occurred_at: at });
    // Two seeds and two deposits sharing one key: exactly one pair forms.
    render(
      <HistoryList
        rows={[
          mk("seed1", "safe_seed", true),
          mk("seed2", "safe_seed", true),
          mk("dep1", "safe", false),
          mk("dep2", "safe", false),
        ]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // One seed is hidden (paired); the other seed + both deposits stay → 3 rows.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
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
