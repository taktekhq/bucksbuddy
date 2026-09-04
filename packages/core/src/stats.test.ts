import { describe, it, expect } from "vitest";
import {
  FETCH_CAP,
  dailySpendSeries,
  isSpending,
  monthInsights,
  monthlySpendTotals,
  monthSpendSeries,
  topCategories,
  treatTransactions,
  weekendTransactions,
} from "./stats.js";
import type { Transaction } from "./types.js";

// Fixtures are built through the local-time Date constructor (and noon, away
// from midnight) so the local-day bucketing is deterministic in any timezone.
const at = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m, d, h).toISOString();
const key = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// June 10, 2026, mid-afternoon: ten days into the month.
const NOW = new Date(2026, 5, 10, 15);

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
    occurred_at: at(2026, 5, 10),
    note: null,
    created_at: at(2026, 5, 10),
    ...overrides,
  };
}

describe("isSpending", () => {
  it("is true for money out, except transfers into the Safe", () => {
    expect(isSpending(tx())).toBe(true);
    expect(isSpending(tx({ is_income: true, category: "salary" }))).toBe(false);
    expect(isSpending(tx({ category: "safe" }))).toBe(false);
  });
});

describe("dailySpendSeries", () => {
  it("zero-fills the whole window when there's nothing", () => {
    const series = dailySpendSeries([], 7, NOW);
    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ date: key(2026, 5, 4), totalCents: 0, count: 0 });
    expect(series[6]).toEqual({ date: key(2026, 5, 10), totalCents: 0, count: 0 });
  });

  it("buckets spending by local day, skipping income, safe and out-of-window rows", () => {
    const rows = [
      tx({ id: "a", occurred_at: at(2026, 5, 9), amount_usd_cents: 500 }),
      tx({ id: "b", occurred_at: at(2026, 5, 9, 18), amount_usd_cents: 250 }),
      tx({
        id: "c",
        is_income: true,
        category: "salary",
        occurred_at: at(2026, 5, 9),
        amount_usd_cents: 9999,
      }),
      tx({ id: "d", category: "safe", occurred_at: at(2026, 5, 9), amount_usd_cents: 9999 }),
      tx({ id: "e", occurred_at: at(2026, 4, 1), amount_usd_cents: 9999 }), // before the window
      tx({ id: "f", occurred_at: at(2026, 5, 20), amount_usd_cents: 9999 }), // future
    ];
    const series = dailySpendSeries(rows, 7, NOW);
    expect(series.find((p) => p.date === key(2026, 5, 9))).toEqual({
      date: key(2026, 5, 9),
      totalCents: 750,
      count: 2,
    });
    // Nothing else leaked in.
    expect(series.reduce((sum, p) => sum + p.totalCents, 0)).toBe(750);
  });

  it("clamps the window to the oldest fetched row when the fetch cap was hit", () => {
    const rows = Array.from({ length: FETCH_CAP }, (_, i) =>
      tx({ id: `r${i}`, occurred_at: at(2026, 5, 8), amount_usd_cents: 10 }),
    );
    const series = dailySpendSeries(rows, 30, NOW);
    // Days before June 8 are unknown (older rows weren't fetched), not zero.
    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({
      date: key(2026, 5, 8),
      totalCents: 10 * FETCH_CAP,
      count: FETCH_CAP,
    });
  });

  it("keeps the full window when the oldest fetched row predates it", () => {
    const rows = [
      ...Array.from({ length: FETCH_CAP - 1 }, (_, i) =>
        tx({ id: `r${i}`, occurred_at: at(2026, 5, 8), amount_usd_cents: 10 }),
      ),
      tx({ id: "old", occurred_at: at(2026, 3, 1), amount_usd_cents: 10 }),
    ];
    const series = dailySpendSeries(rows, 7, NOW);
    expect(series).toHaveLength(7);
    expect(series.find((p) => p.date === key(2026, 5, 8))?.totalCents).toBe(
      10 * (FETCH_CAP - 1),
    );
  });
});

describe("monthSpendSeries", () => {
  it("covers the whole calendar month, zero-filling quiet days", () => {
    const series = monthSpendSeries([], NOW);
    expect(series).toHaveLength(30); // June 2026 has 30 days
    expect(series[0].date).toBe(key(2026, 5, 1));
    expect(series[29].date).toBe(key(2026, 5, 30));
  });

  it("buckets spending by local day, skipping income, safe and other months", () => {
    const rows = [
      tx({ id: "a", occurred_at: at(2026, 5, 3), amount_usd_cents: 400 }),
      tx({ id: "b", occurred_at: at(2026, 5, 3, 18), amount_usd_cents: 100 }),
      tx({
        id: "c",
        is_income: true,
        category: "salary",
        occurred_at: at(2026, 5, 3),
        amount_usd_cents: 9999,
      }),
      tx({ id: "d", category: "safe", occurred_at: at(2026, 5, 3), amount_usd_cents: 9999 }),
      tx({ id: "e", occurred_at: at(2026, 4, 30), amount_usd_cents: 9999 }), // prev month
    ];
    const series = monthSpendSeries(rows, NOW);
    expect(series.find((p) => p.date === key(2026, 5, 3))).toEqual({
      date: key(2026, 5, 3),
      totalCents: 500,
      count: 2,
    });
    expect(series.reduce((sum, p) => sum + p.totalCents, 0)).toBe(500);
  });

  it("charts a past month when anchored there", () => {
    const mayAnchor = new Date(2026, 4, 31, 12);
    const series = monthSpendSeries(
      [tx({ occurred_at: at(2026, 4, 15), amount_usd_cents: 250 })],
      mayAnchor,
    );
    expect(series).toHaveLength(31); // May has 31 days
    expect(series.find((p) => p.date === key(2026, 4, 15))?.totalCents).toBe(250);
  });
});

describe("monthlySpendTotals", () => {
  it("totals spending per month oldest-first, tagging the current month", () => {
    const rows = [
      tx({ id: "jun1", occurred_at: at(2026, 5, 2), amount_usd_cents: 1000 }),
      tx({ id: "jun2", occurred_at: at(2026, 5, 9), amount_usd_cents: 500 }),
      tx({ id: "may", occurred_at: at(2026, 4, 10), amount_usd_cents: 2000 }),
      tx({
        id: "inc",
        is_income: true,
        category: "salary",
        occurred_at: at(2026, 5, 2),
        amount_usd_cents: 9999,
      }),
      tx({ id: "safe", category: "safe", occurred_at: at(2026, 5, 2), amount_usd_cents: 9999 }),
      // Older than the 6-month window: falls outside every bucket, so it's
      // dropped rather than crashing on a missing map entry.
      tx({ id: "ancient", occurred_at: at(2025, 0, 1), amount_usd_cents: 9999 }),
    ];
    const months = monthlySpendTotals(rows, 6, NOW);
    expect(months).toHaveLength(6);
    expect(months[months.length - 1]).toMatchObject({
      label: "Jun",
      offset: 0,
      isCurrent: true,
      totalCents: 1500,
    });
    expect(months[months.length - 2]).toMatchObject({
      label: "May",
      offset: -1,
      isCurrent: false,
      totalCents: 2000,
    });
    // Income and Safe transfers never count toward spending.
    expect(months.reduce((sum, m) => sum + m.totalCents, 0)).toBe(3500);
  });

  it("spans the requested number of months, oldest first", () => {
    const months = monthlySpendTotals([], 3, NOW);
    expect(months.map((m) => m.label)).toEqual(["Apr", "May", "Jun"]);
    expect(months.map((m) => m.offset)).toEqual([-2, -1, 0]);
  });
});

describe("topCategories", () => {
  const rows = [
    tx({ id: "a", category: "food/restaurant", amount_usd_cents: 1000 }),
    tx({ id: "b", category: "food/delivery", amount_usd_cents: 500 }),
    tx({ id: "c", category: "groceries", amount_usd_cents: 700 }),
    tx({ id: "d", category: "coffee", amount_usd_cents: 300 }),
    tx({ id: "e", is_income: true, category: "salary", amount_usd_cents: 9999 }),
    tx({ id: "f", category: "safe", amount_usd_cents: 9999 }),
    tx({ id: "g", occurred_at: at(2026, 4, 31), amount_usd_cents: 9999 }), // last month
    tx({ id: "h", occurred_at: at(2026, 6, 1), amount_usd_cents: 9999 }), // next month
  ];

  it("groups this month's spending by base category, biggest first", () => {
    const cats = topCategories(rows, 6, NOW);
    expect(cats.map((c) => c.category)).toEqual(["food", "groceries", "coffee"]);
    // Subcategories fold into their parent.
    expect(cats[0]).toEqual({
      category: "food",
      totalCents: 1500,
      count: 2,
      share: 1500 / 2500,
    });
  });

  it("respects the limit", () => {
    expect(topCategories(rows, 2, NOW)).toHaveLength(2);
  });

  it("falls back to entry counts when every total is masked to zero", () => {
    const masked = [
      tx({ id: "a", category: "coffee", amount_usd_cents: 0, amountMask: "xx" }),
      tx({ id: "b", category: "coffee", amount_usd_cents: 0, amountMask: "yy" }),
      tx({ id: "c", category: "gas", amount_usd_cents: 0, amountMask: "zz" }),
    ];
    const cats = topCategories(masked, 6, NOW);
    expect(cats.map((c) => c.category)).toEqual(["coffee", "gas"]);
    expect(cats[0].count).toBe(2);
    expect(cats[0].share).toBe(0); // no real total to take a share of
  });
});

describe("monthInsights", () => {
  it("sums up the month's story", () => {
    const big = tx({
      id: "big",
      category: "food/restaurant",
      amount_usd_cents: 1000,
      occurred_at: at(2026, 5, 5),
    });
    const rows = [
      tx({ id: "a", category: "groceries", amount_usd_cents: 700, occurred_at: at(2026, 5, 2) }),
      // A coffee binge: busiest day (3 entries) without being the priciest.
      tx({ id: "d1", category: "coffee", amount_usd_cents: 200, occurred_at: at(2026, 5, 9, 9) }),
      tx({ id: "d2", category: "coffee", amount_usd_cents: 200, occurred_at: at(2026, 5, 9, 9) }),
      tx({ id: "d3", category: "coffee", amount_usd_cents: 200, occurred_at: at(2026, 5, 9, 9) }),
      big,
      tx({ id: "c", category: "coffee", amount_usd_cents: 300, occurred_at: at(2026, 5, 5, 18) }),
      // A weekend treat each day: June 6, 2026 is a Saturday, the 7th a Sunday.
      tx({ id: "w1", category: "fun/drinks", amount_usd_cents: 500, occurred_at: at(2026, 5, 6, 20) }),
      tx({ id: "w2", category: "self_care/spa", amount_usd_cents: 800, occurred_at: at(2026, 5, 7, 15) }),
      tx({ id: "e", is_income: true, category: "salary", amount_usd_cents: 5000, occurred_at: at(2026, 5, 3) }),
      // Safe transfers are internal: neither spending (out) nor income (back in).
      tx({ id: "f", category: "safe", amount_usd_cents: 400, occurred_at: at(2026, 5, 7) }),
      tx({ id: "g", is_income: true, category: "safe", amount_usd_cents: 400, occurred_at: at(2026, 5, 8) }),
      // Outside the month, both directions.
      tx({ id: "h", amount_usd_cents: 9999, occurred_at: at(2026, 4, 31) }),
      tx({ id: "i", is_income: true, category: "salary", amount_usd_cents: 9999, occurred_at: at(2026, 6, 1) }),
    ];
    expect(monthInsights(rows, NOW)).toEqual({
      spentCents: 3900,
      incomeCents: 5000,
      spendCount: 8,
      avgPerDayCents: 390, // 3900 over the 10 elapsed days
      forecastCents: 11700, // that pace carried across June's 30 days
      biggestExpense: big,
      busiestDay: { date: key(2026, 5, 9), count: 3, totalCents: 600 },
      noSpendDays: 5, // 10 elapsed − 5 days with spending
      coffeeCount: 4,
      treatCents: 1300, // fun + self care
      weekendCents: 1300, // the Sat drinks + Sun spa
      anyMasked: false,
    });
  });

  it("comes back blank for an empty month", () => {
    expect(monthInsights([], NOW)).toEqual({
      spentCents: 0,
      incomeCents: 0,
      spendCount: 0,
      avgPerDayCents: 0,
      forecastCents: 0,
      biggestExpense: null,
      busiestDay: null,
      noSpendDays: 10,
      coffeeCount: 0,
      treatCents: 0,
      weekendCents: 0,
      anyMasked: false,
    });
  });

  it("flags masked rows so the UI doesn't trust the zeros", () => {
    const masked = monthInsights([tx({ amount_usd_cents: 0, amountMask: "ab" })], NOW);
    expect(masked.anyMasked).toBe(true);
  });

  // The fixtures above all sit at noon, so nothing ever lands on a month
  // boundary. An entry stamped exactly 00:00:00 on the 1st is real though —
  // backdated and imported rows default to midnight — and the range check is
  // half-open (`at < from || at >= to`), so it belongs to the month it opens.
  it("includes an entry at exactly midnight on the 1st", () => {
    const rows = [tx({ amount_usd_cents: 500, occurred_at: at(2026, 5, 1, 0) })];
    expect(monthInsights(rows, NOW).spentCents).toBe(500);
  });

  it("excludes an entry at exactly midnight on the 1st of next month", () => {
    const rows = [tx({ amount_usd_cents: 500, occurred_at: at(2026, 6, 1, 0) })];
    expect(monthInsights(rows, NOW).spentCents).toBe(0);
  });

  // June is 30 days and so is April, so a June `now` can't tell "this month's
  // length" apart from a neighbouring month's. February can: 28 days, against
  // December's 31.
  it("forecasts on this month's length, not a neighbouring month's", () => {
    const FEB = new Date(2026, 1, 10, 15);
    const rows = [tx({ amount_usd_cents: 1000, occurred_at: at(2026, 1, 5) })];
    // 1000c over 10 elapsed days, carried across February's 28.
    expect(monthInsights(rows, FEB).forecastCents).toBe(2800);
  });

  // The fixture above happens to hold 4 coffees among 8 spending entries, so
  // counting *non*-coffee would give the same 4. Count an uneven set instead.
  it("counts only coffee, on a set where the inverse would differ", () => {
    const rows = [
      tx({ id: "c1", category: "coffee", occurred_at: at(2026, 5, 2) }),
      tx({ id: "g1", category: "groceries", occurred_at: at(2026, 5, 3) }),
      tx({ id: "g2", category: "groceries", occurred_at: at(2026, 5, 4) }),
      tx({ id: "g3", category: "groceries", occurred_at: at(2026, 5, 5) }),
    ];
    expect(monthInsights(rows, NOW).coffeeCount).toBe(1);
  });
});

// --- boundary, ordering and tie-break specs -------------------------------
// These pin behaviour that the fixtures above cover but never distinguish:
// entries exactly on a month edge, the category sort and its tiebreak, and
// which row wins when two are equal.

describe("dailySpendSeries edges", () => {
  it("includes today when `now` falls exactly on midnight", () => {
    // With a mid-afternoon `now` the final day is inside the window either
    // way; at exactly midnight, only an inclusive bound keeps it.
    const midnight = new Date(2026, 5, 10, 0, 0, 0, 0);
    expect(dailySpendSeries([], 2, midnight)).toHaveLength(2);
  });

  it("clamps the window to the oldest row, wherever it sits in the array", () => {
    // At the fetch cap the window starts at the oldest row rather than the
    // full `days` back. The oldest is deliberately NOT last in the array.
    const rows = [
      tx({ id: "oldest", occurred_at: at(2026, 5, 5) }),
      ...Array.from({ length: FETCH_CAP - 1 }, (_, i) =>
        tx({ id: `r${i}`, occurred_at: at(2026, 5, 9) }),
      ),
    ];
    // June 5 → June 10 inclusive is six days; the naive 30-day window is longer.
    expect(dailySpendSeries(rows, 30, NOW)).toHaveLength(6);
  });
});

describe("topCategories ordering", () => {
  const rows = [
    // Insertion order is deliberately the reverse of the expected order, so an
    // unsorted or wrongly-sorted result cannot coincide with the right one.
    tx({ id: "c1", category: "coffee", amount_usd_cents: 300, occurred_at: at(2026, 5, 2) }),
    tx({ id: "c2", category: "coffee", amount_usd_cents: 200, occurred_at: at(2026, 5, 3) }),
    tx({ id: "f1", category: "fun", amount_usd_cents: 100, occurred_at: at(2026, 5, 2) }),
    tx({ id: "f2", category: "fun", amount_usd_cents: 100, occurred_at: at(2026, 5, 3) }),
    tx({ id: "f3", category: "fun", amount_usd_cents: 100, occurred_at: at(2026, 5, 4) }),
    tx({ id: "f4", category: "fun", amount_usd_cents: 100, occurred_at: at(2026, 5, 5) }),
    tx({ id: "f5", category: "fun", amount_usd_cents: 100, occurred_at: at(2026, 5, 6) }),
    tx({ id: "g1", category: "groceries", amount_usd_cents: 1000, occurred_at: at(2026, 5, 2) }),
  ];

  it("sorts by spend, then breaks ties on entry count", () => {
    // groceries 1000c; coffee and fun tie at 500c, so the busier one (fun, 5
    // entries) comes first.
    expect(topCategories(rows, 6, NOW).map((c) => c.category)).toEqual([
      "groceries",
      "fun",
      "coffee",
    ]);
  });

  it("counts an entry at exactly midnight on the 1st, and not next month's", () => {
    const edge = [
      tx({ id: "in", category: "fun", amount_usd_cents: 500, occurred_at: at(2026, 5, 1, 0) }),
      tx({ id: "out", category: "coffee", amount_usd_cents: 900, occurred_at: at(2026, 6, 1, 0) }),
    ];
    expect(topCategories(edge, 6, NOW).map((c) => c.category)).toEqual(["fun"]);
  });
});

describe("monthInsights tie-breaks", () => {
  it("keeps the first of two equally large expenses", () => {
    const first = tx({ id: "first", amount_usd_cents: 900, occurred_at: at(2026, 5, 2) });
    const second = tx({ id: "second", amount_usd_cents: 900, occurred_at: at(2026, 5, 3) });
    expect(monthInsights([first, second], NOW).biggestExpense?.id).toBe("first");
  });

  it("keeps the first of two equally busy days", () => {
    const rows = [
      tx({ id: "a1", occurred_at: at(2026, 5, 2, 9) }),
      tx({ id: "a2", occurred_at: at(2026, 5, 2, 10) }),
      tx({ id: "b1", occurred_at: at(2026, 5, 3, 9) }),
      tx({ id: "b2", occurred_at: at(2026, 5, 3, 10) }),
    ];
    expect(monthInsights(rows, NOW).busiestDay?.date).toBe(key(2026, 5, 2));
  });

  it("counts shopping as a treat, alongside fun and self care", () => {
    const rows = [
      tx({ id: "s", category: "shopping/clothes", amount_usd_cents: 600, occurred_at: at(2026, 5, 2) }),
    ];
    expect(monthInsights(rows, NOW).treatCents).toBe(600);
  });
});

describe("treatTransactions", () => {
  it("returns this month's treats, newest first", () => {
    const rows = [
      tx({ id: "w1", category: "fun/drinks", occurred_at: at(2026, 5, 6, 20) }),
      tx({ id: "w2", category: "self_care/spa", occurred_at: at(2026, 5, 7, 15) }),
      tx({ id: "g", category: "groceries", occurred_at: at(2026, 5, 8) }), // not a treat
      tx({ id: "inc", is_income: true, category: "salary", occurred_at: at(2026, 5, 6) }),
      tx({ id: "may", category: "fun", occurred_at: at(2026, 4, 31) }),
      tx({ id: "jul", category: "shopping", occurred_at: at(2026, 6, 1) }),
    ];
    expect(treatTransactions(rows, NOW).map((r) => r.id)).toEqual(["w2", "w1"]);
  });

  // The fixtures above sit at noon, so neither edge of the half-open month
  // range is ever probed exactly.
  it("takes an entry at exactly midnight on the 1st, but not next month's", () => {
    const rows = [
      tx({ id: "first", category: "fun", occurred_at: at(2026, 5, 1, 0) }),
      tx({ id: "next", category: "fun", occurred_at: at(2026, 6, 1, 0) }),
    ];
    expect(treatTransactions(rows, NOW).map((r) => r.id)).toEqual(["first"]);
  });
});

describe("weekendTransactions", () => {
  it("returns this month's Sat/Sun spending, newest first", () => {
    const rows = [
      tx({ id: "sat", occurred_at: at(2026, 5, 6) }), // Saturday
      tx({ id: "sun", category: "coffee", occurred_at: at(2026, 5, 7) }), // Sunday
      tx({ id: "tue", occurred_at: at(2026, 5, 9) }), // weekday
    ];
    expect(weekendTransactions(rows, NOW).map((r) => r.id)).toEqual(["sun", "sat"]);
  });
});

describe("defaults", () => {
  it("falls back to the real clock when `now` isn't given", () => {
    expect(dailySpendSeries([], 2)).toHaveLength(2);
    expect(topCategories([])).toEqual([]);
    expect(treatTransactions([])).toEqual([]);
    expect(weekendTransactions([])).toEqual([]);
    const insights = monthInsights([]);
    expect(insights.spentCents).toBe(0);
    expect(insights.biggestExpense).toBeNull();
  });
});
