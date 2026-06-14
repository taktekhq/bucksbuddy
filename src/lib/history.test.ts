import { describe, it, expect } from "vitest";
import { groupByCategory, groupByDay } from "@/lib/history";
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

describe("groupByDay", () => {
  // A fixed "now" so Today/Yesterday labels are deterministic. 15 Jun 2026 local.
  const now = new Date(2026, 5, 15, 13, 30);
  // Build a local-midday ISO for a given local Y/M/D so day bucketing doesn't
  // straddle a timezone boundary in CI.
  const at = (y: number, m: number, d: number, h = 12) =>
    new Date(y, m - 1, d, h).toISOString();

  it("splits entries into day sections, newest day first", () => {
    const days = groupByDay(
      [
        tx({ id: "a", category: "gas", occurred_at: at(2026, 6, 13) }),
        tx({ id: "b", category: "coffee", occurred_at: at(2026, 6, 15) }),
      ],
      now,
    );
    expect(days.map((d) => d.label)).toEqual(["Today", "Jun 13"]);
  });

  it("collapses only back-to-back same-category entries within a day", () => {
    const days = groupByDay(
      [
        tx({ id: "a", category: "coffee", occurred_at: at(2026, 6, 15, 9) }),
        tx({ id: "b", category: "coffee", occurred_at: at(2026, 6, 15, 10) }),
        tx({ id: "c", category: "gas", occurred_at: at(2026, 6, 15, 11) }),
        tx({ id: "d", category: "coffee", occurred_at: at(2026, 6, 15, 12) }),
      ],
      now,
    );
    expect(days).toHaveLength(1);
    // Newest-first: coffee(12) alone, gas(11) alone, coffee(10,9) as a run.
    const runs = days[0].groups;
    expect(runs.map((g) => `${g.category}:${g.count}`)).toEqual([
      "coffee:1",
      "gas:1",
      "coffee:2",
    ]);
    expect(runs[2].rows.map((r) => r.id)).toEqual(["b", "a"]); // DESC within run
  });

  it("keeps income and expense of the same category in separate runs", () => {
    const days = groupByDay(
      [
        tx({ id: "a", category: "other", is_income: false, occurred_at: at(2026, 6, 15, 9) }),
        tx({ id: "b", category: "other", is_income: true, occurred_at: at(2026, 6, 15, 10) }),
      ],
      now,
    );
    expect(days[0].groups).toHaveLength(2);
  });

  it("sums a signed net total per day", () => {
    const a = tx({ id: "a", amount_usd_cents: 1000, is_income: false, occurred_at: at(2026, 6, 15, 9) });
    const b = tx({ id: "b", amount_usd_cents: 2500, is_income: true, occurred_at: at(2026, 6, 15, 10) });
    const days = groupByDay([a, b], now);
    expect(days[0].totalCents).toBe(netCents([a, b])); // 2500 - 1000 = 1500
  });

  it("marks a day masked when any of its rows is obscured", () => {
    const days = groupByDay(
      [
        tx({ id: "a", occurred_at: at(2026, 6, 15, 9) }),
        tx({ id: "b", amountMask: "a8F2", occurred_at: at(2026, 6, 15, 10) }),
      ],
      now,
    );
    expect(days[0].masked).toBe(true);
  });

  it("returns no days for an empty history", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
