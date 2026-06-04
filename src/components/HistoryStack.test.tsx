import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

import { HistoryStack } from "@/components/HistoryStack";
import { groupByCategory } from "@/lib/history";
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

function group(rows: Transaction[]) {
  return groupByCategory(rows)[0];
}

describe("HistoryStack", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders a multi-entry group collapsed with a count and signed total", () => {
    render(
      <HistoryStack
        group={group([tx({ id: "a" }), tx({ id: "b" })])}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("2 entries")).toBeInTheDocument();
    expect(screen.getByText("-$25.00")).toBeInTheDocument();
    // Rows aren't rendered until the stack is opened.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("expands to one row per entry on tap", () => {
    render(
      <HistoryStack
        group={group([tx({ id: "a" }), tx({ id: "b" }), tx({ id: "c" })])}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Groceries, 3 entries/ }));
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(3);
  });

  it("renders a single-entry group as a plain row (no stack)", () => {
    render(
      <HistoryStack group={group([tx()])} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(screen.queryByText(/entries/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("hides the numeric total when any entry is masked", () => {
    render(
      <HistoryStack
        group={group([tx({ id: "a", amountMask: "a8F2" }), tx({ id: "b" })])}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("-••••")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("keeps the sign when masking an income group", () => {
    render(
      <HistoryStack
        group={group([
          tx({ id: "a", is_income: true, category: "salary", amountMask: "a8F2" }),
          tx({ id: "b", is_income: true, category: "salary" }),
        ])}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("+••••")).toBeInTheDocument();
  });

  it("fires edit and delete from an expanded row", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const rows = [tx({ id: "a" }), tx({ id: "b" })];
    render(
      <HistoryStack group={group(rows)} onEdit={onEdit} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Groceries, 2 entries/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
