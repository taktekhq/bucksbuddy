import { describe, it, expect } from "vitest";
import { groupByCategory } from "@/lib/history";
import { netCents } from "@/lib/money";
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

describe("groupByCategory", () => {
  it("merges same direction + category and sorts rows newest-first", () => {
    const older = tx({ id: "a", occurred_at: "2026-06-01T10:00:00.000Z" });
    const newer = tx({ id: "b", occurred_at: "2026-06-03T10:00:00.000Z" });
    const groups = groupByCategory([older, newer]);

    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.count).toBe(2);
    expect(g.rows.map((r) => r.id)).toEqual(["b", "a"]); // DESC
    expect(g.totalCents).toBe(netCents([older, newer]));
    expect(g.masked).toBe(false);
  });

  it("keeps sub-categories of the same parent separate", () => {
    const groups = groupByCategory([
      tx({ id: "a", category: "food/restaurant" }),
      tx({ id: "b", category: "food/delivery" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps income and expense of the same id in separate stacks", () => {
    const groups = groupByCategory([
      tx({ id: "a", category: "other", is_income: false }),
      tx({ id: "b", category: "other", is_income: true }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.key))).toEqual(
      new Set(["false:other", "true:other"]),
    );
  });

  it("flags a group as masked when any row is obscured", () => {
    const groups = groupByCategory([
      tx({ id: "a" }),
      tx({ id: "b", amountMask: "a8F2" }),
    ]);
    expect(groups[0].masked).toBe(true);
  });

  it("orders stacks by most recent activity first", () => {
    const groups = groupByCategory([
      tx({ id: "a", category: "gas", occurred_at: "2026-06-01T10:00:00.000Z" }),
      tx({ id: "b", category: "coffee", occurred_at: "2026-06-05T10:00:00.000Z" }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["coffee", "gas"]);
  });

  it("returns a single-entry group for one row", () => {
    const groups = groupByCategory([tx()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
  });
});
