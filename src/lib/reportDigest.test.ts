import { describe, it, expect } from "vitest";
import { buildDigest, type ReportWindow } from "@/lib/reportDigest";
import type { Transaction } from "@/types/db";

// Fixtures are built through the local-time Date constructor (and noon, away
// from midnight) so the local-day bucketing is deterministic in any timezone,
// and every window is passed in explicitly — nothing reads the clock.
const at = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m, d, h).toISOString();

// Every fixture row carries a distinctive note, so any leak of free text into
// the digest is a substring match away (see "never carries note text").
let seq = 0;
function row(over: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: "u1",
    is_income: false,
    category: "other",
    amount_usd_cents: 100,
    original_currency: "USD",
    original_amount: 1,
    rate_used: 1,
    occurred_at: at(2026, 5, 1),
    note: `SECRETNOTE-${seq}`,
    created_at: at(2026, 5, 1),
    ...over,
  };
}
/** Money out. */
const out = (category: string, cents: number, occurred_at: string) =>
  row({ category, amount_usd_cents: cents, occurred_at, is_income: false });
/** Money in. */
const moneyIn = (category: string, cents: number, occurred_at: string) =>
  row({ category, amount_usd_cents: cents, occurred_at, is_income: true });

const win = (
  from: Date,
  to: Date,
  id: ReportWindow["id"] = "past_3_months",
): ReportWindow => ({ id, from, to });

// --- the main fixture: June 1 – Sept 1 2026, with July deliberately empty ---
//
// June 2026 starts on a Monday and August 1 2026 is a Saturday, which is what
// makes the weekday and weekend assertions below land where they do.
const MAIN_WINDOW = win(new Date(2026, 5, 1), new Date(2026, 8, 1));
const MAIN_ROWS: Transaction[] = [
  out("fees/subscriptions", 1200, at(2026, 5, 1)), //  Mon Jun 1
  out("fees/subscriptions", 1200, at(2026, 5, 3)), //  Wed Jun 3
  out("fees/subscriptions", 1200, at(2026, 5, 8)), //  Mon Jun 8
  out("fees/subscriptions", 1200, at(2026, 5, 10)), // Wed Jun 10 — 4 repeats
  out("groceries/supermarket", 5000, at(2026, 5, 2)), // Tue Jun 2
  out("food/restaurant", 2500, at(2026, 5, 2)), //      Tue Jun 2 — 2 on a day
  out("groceries/supermarket", 5000, at(2026, 5, 9)),
  out("groceries/supermarket", 5000, at(2026, 5, 16)), // 3 repeats at 5000
  out("transport/taxi", 2000, at(2026, 5, 4)),
  out("transport/taxi", 2000, at(2026, 5, 11)),
  out("transport/taxi", 2000, at(2026, 5, 18)), //       3 repeats at 2000
  out("coffee", 800, at(2026, 5, 20)), //               Sat Jun 20, no subcategory
  out("gym", 3000, at(2026, 5, 5)),
  out("gym", 3000, at(2026, 5, 12)), //                 only 2 — not a repeat
  moneyIn("salary", 300000, at(2026, 5, 5)), //         income
  out("safe", 10000, at(2026, 5, 5)), //                into the Safe: a transfer
  moneyIn("safe", 4000, at(2026, 5, 6)), //             out of the Safe: not income
  out("rent", 60000, at(2026, 7, 1)), //                Sat Aug 1 — new in August
  out("groceries/supermarket", 7000, at(2026, 7, 3)),
  out("food/restaurant", 2500, at(2026, 7, 4)),
  out("coffee", 1600, at(2026, 7, 5)),
];
const MAIN = buildDigest(MAIN_ROWS, MAIN_WINDOW, "USD");

/** Every number anywhere in a digest, for the no-NaN guarantee. */
function numbersIn(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(numbersIn);
  }
  return [];
}

describe("buildDigest — the period it declares", () => {
  it("names the window it was sold for, not today's", () => {
    expect(MAIN.version).toBe(1);
    expect(MAIN.period).toEqual({
      id: "past_3_months",
      label: "June 2026 – August 2026",
      from: "2026-06-01",
      // `to` is exclusive on the way in and inclusive on the way out, so the
      // label reads as the last day actually covered.
      to: "2026-08-31",
      days: 92,
      months: 3,
    });
  });

  it("carries the home currency's code and symbol", () => {
    expect(MAIN.currency).toEqual({ code: "USD", symbol: "$" });
  });

  it("formats every figure in the home currency", () => {
    const lbp = buildDigest(
      [out("groceries", 500000, at(2026, 7, 4))],
      win(new Date(2026, 7, 1), new Date(2026, 8, 1), "last_month"),
      "LBP",
    );
    expect(lbp.currency).toEqual({ code: "LBP", symbol: "LL" });
    // LBP has no minor unit, and a letter symbol gets a space.
    expect(lbp.totals.spent).toEqual({ cents: 500000, display: "LL 5,000" });
    expect(lbp.categories[0].spent.display).toBe("LL 5,000");
  });
});

describe("buildDigest — which rows count", () => {
  it("keeps [from, to) and drops everything either side of it", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 6, 1);
    const digest = buildDigest(
      [
        out("food", 999, new Date(from.getTime() - 1).toISOString()), // just before
        out("food", 111, from.toISOString()), //                        the instant `from`
        out("food", 222, at(2026, 5, 15)), //                           mid-window
        out("food", 333, new Date(to.getTime() - 1).toISOString()), //  the last instant
        out("food", 888, to.toISOString()), //                          the instant `to`
      ],
      win(from, to, "last_month"),
      "USD",
    );
    expect(digest.totals.entryCount).toBe(3);
    expect(digest.totals.spendCount).toBe(3);
    expect(digest.totals.spent).toEqual({ cents: 666, display: "$6.66" });
  });

  it("counts income, but not a withdrawal from the Safe, and never spends into it", () => {
    const digest = buildDigest(
      [
        moneyIn("salary", 100000, at(2026, 5, 2)), // income
        moneyIn("safe", 30000, at(2026, 5, 3)), //   cash back out of the Safe
        out("safe", 20000, at(2026, 5, 4)), //       cash into the Safe
        out("groceries", 1500, at(2026, 5, 5)), //   the only real spending
      ],
      win(new Date(2026, 5, 1), new Date(2026, 6, 1), "last_month"),
      "USD",
    );
    expect(digest.totals.income).toEqual({ cents: 100000, display: "$1,000.00" });
    expect(digest.totals.spent).toEqual({ cents: 1500, display: "$15.00" });
    expect(digest.totals.net).toEqual({ cents: 98500, display: "$985.00" });
    expect(digest.totals.spendCount).toBe(1);
    expect(digest.totals.entryCount).toBe(4);
    // Neither Safe row reaches the category breakdown.
    expect(digest.categories.map((c) => c.label)).toEqual(["Groceries"]);
    expect(digest.months[0].income.cents).toBe(100000);
    expect(digest.months[0].spent.cents).toBe(1500);
  });
});

describe("buildDigest — totals", () => {
  it("totals spending, income and the net across the window", () => {
    expect(MAIN.totals.spent).toEqual({ cents: 106200, display: "$1,062.00" });
    expect(MAIN.totals.income).toEqual({ cents: 300000, display: "$3,000.00" });
    expect(MAIN.totals.net).toEqual({ cents: 193800, display: "$1,938.00" });
    expect(MAIN.totals.spendCount).toBe(18);
    // 18 expenses + a salary + a Safe deposit + a Safe withdrawal.
    expect(MAIN.totals.entryCount).toBe(21);
  });

  it("averages over calendar days, logged days and entries separately", () => {
    // 106200 / 92 days, / 18 logged days, / 18 expenses.
    expect(MAIN.totals.dailyAverage).toEqual({ cents: 1154, display: "$11.54" });
    expect(MAIN.totals.perLoggedDayAverage).toEqual({
      cents: 5900,
      display: "$59.00",
    });
    expect(MAIN.totals.averageExpense).toEqual({ cents: 5900, display: "$59.00" });
  });

  it("takes the mean of the middle two for an even number of expenses", () => {
    // 18 expenses: …2000, 2500… straddle the middle.
    expect(MAIN.totals.medianExpense).toEqual({ cents: 2250, display: "$22.50" });
    const half = buildDigest(
      [out("food", 1000, at(2026, 5, 2)), out("food", 1001, at(2026, 5, 3))],
      win(new Date(2026, 5, 1), new Date(2026, 6, 1), "last_month"),
      "USD",
    );
    expect(half.totals.medianExpense.cents).toBe(1001); // round(1000.5)
  });

  it("takes the middle expense for an odd number of them", () => {
    const odd = buildDigest(
      [
        out("food", 5000, at(2026, 5, 2)),
        out("food", 1000, at(2026, 5, 3)),
        out("food", 2000, at(2026, 5, 4)),
      ],
      win(new Date(2026, 5, 1), new Date(2026, 6, 1), "last_month"),
      "USD",
    );
    expect(odd.totals.medianExpense).toEqual({ cents: 2000, display: "$20.00" });
  });
});

describe("buildDigest — coverage", () => {
  it("distinguishes days logged, days with nothing at all, and days with no spending", () => {
    // 18 of 92 days carry an entry; one of those 18 (Jun 6) carries only a
    // withdrawal from the Safe, so it is logged but has no spending.
    expect(MAIN.coverage.days).toBe(92);
    expect(MAIN.coverage.daysLogged).toBe(18);
    expect(MAIN.coverage.daysWithNothingLogged).toBe(74);
    expect(MAIN.coverage.daysWithNoSpending).toBe(75);
    expect(MAIN.coverage.coveragePct).toBe(19.6);
  });

  it("measures the longest run of days with nothing logged", () => {
    // Jun 20 is the last logged day of June and Aug 1 the next one:
    // Jun 21–30 (10) + all of July (31) = 41.
    expect(MAIN.coverage.longestGapDays).toBe(41);
  });

  it("reports no gap when every day in the window is logged", () => {
    // Sunday Jun 7 through Tuesday Jun 9 — three days, three entries.
    const digest = buildDigest(
      [
        out("coffee", 1000, at(2026, 5, 7)), // Sunday
        out("gym", 2000, at(2026, 5, 8)),
        out("food", 1000, at(2026, 5, 9)),
      ],
      win(new Date(2026, 5, 7), new Date(2026, 5, 10), "last_month"),
      "USD",
    );
    expect(digest.coverage.days).toBe(3);
    expect(digest.coverage.daysLogged).toBe(3);
    expect(digest.coverage.daysWithNothingLogged).toBe(0);
    expect(digest.coverage.daysWithNoSpending).toBe(0);
    expect(digest.coverage.coveragePct).toBe(100);
    expect(digest.coverage.longestGapDays).toBe(0);
    // Sunday counts towards the weekend just as Saturday does.
    expect(digest.weekdaysLogged[0].count).toBe(1);
    expect(digest.weekendSharePct).toBe(25);
  });

  it("names the day with the most expenses on it", () => {
    // Two entries on Jun 2 (5000 + 2500); every other day has one.
    expect(MAIN.coverage.busiestDay).toEqual({
      date: "2026-06-02",
      count: 2,
      spent: { cents: 7500, display: "$75.00" },
    });
  });

  it("keeps the first day when two are equally busy", () => {
    // Jun 20 is listed first, Jun 2 second; both have two expenses.
    const digest = buildDigest(
      [
        out("food", 1000, at(2026, 5, 20)),
        out("coffee", 500, at(2026, 5, 20)),
        out("food", 2000, at(2026, 5, 2)),
        out("gym", 3000, at(2026, 5, 2)),
      ],
      win(new Date(2026, 5, 1), new Date(2026, 6, 1), "last_month"),
      "USD",
    );
    expect(digest.coverage.busiestDay).toEqual({
      date: "2026-06-20",
      count: 2,
      spent: { cents: 1500, display: "$15.00" },
    });
  });

  it("has no busiest day when nothing was spent", () => {
    const digest = buildDigest(
      [
        moneyIn("salary", 5000, at(2026, 5, 3)),
        out("safe", 1000, at(2026, 5, 4)),
      ],
      win(new Date(2026, 5, 1), new Date(2026, 6, 1), "last_month"),
      "USD",
    );
    expect(digest.coverage.busiestDay).toBeNull();
    expect(digest.totals.spent.cents).toBe(0);
    expect(digest.totals.income.cents).toBe(5000);
    expect(digest.totals.spendCount).toBe(0);
    expect(digest.coverage.daysLogged).toBe(2);
    expect(digest.coverage.daysWithNoSpending).toBe(30);
    expect(digest.categories).toEqual([]);
    expect(digest.subcategories).toEqual([]);
    expect(digest.largestExpenses).toEqual([]);
    expect(digest.repeatedCharges).toEqual([]);
    expect(digest.weekendSharePct).toBe(0);
    expect(digest.totals.medianExpense.cents).toBe(0);
    expect(digest.totals.averageExpense.cents).toBe(0);
  });
});

describe("buildDigest — per calendar month", () => {
  it("emits one entry per month, including a month with no entries at all", () => {
    expect(MAIN.months.map((m) => m.key)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(MAIN.months.map((m) => m.label)).toEqual([
      "June 2026",
      "July 2026",
      "August 2026",
    ]);
    expect(MAIN.months.map((m) => m.days)).toEqual([30, 31, 31]);
  });

  it("totals June on its own", () => {
    expect(MAIN.months[0]).toMatchObject({
      spent: { cents: 35100, display: "$351.00" },
      income: { cents: 300000, display: "$3,000.00" },
      net: { cents: 264900, display: "$2,649.00" },
      spendCount: 14,
      daysLogged: 14,
      dailyAverage: { cents: 1170, display: "$11.70" }, // 35100 / 30
    });
  });

  it("zeroes an empty month rather than skipping it", () => {
    expect(MAIN.months[1]).toMatchObject({
      spent: { cents: 0, display: "$0.00" },
      income: { cents: 0, display: "$0.00" },
      net: { cents: 0, display: "$0.00" },
      spendCount: 0,
      daysLogged: 0,
      dailyAverage: { cents: 0, display: "$0.00" },
    });
  });

  it("totals August, where spending ran ahead of income", () => {
    expect(MAIN.months[2]).toMatchObject({
      spent: { cents: 71100, display: "$711.00" },
      income: { cents: 0, display: "$0.00" },
      spendCount: 4,
      daysLogged: 4,
      dailyAverage: { cents: 2294, display: "$22.94" }, // round(71100 / 31)
    });
    // The net is negative, and `formatCents` is unsigned — so the display
    // string reads as if August had been in the black.
    expect(MAIN.months[2].net.cents).toBe(-71100);
    expect(MAIN.months[2].net.display).toBe("$711.00");
  });
});

describe("buildDigest — categories", () => {
  it("ranks base categories by total, breaking ties on the number of entries", () => {
    expect(
      MAIN.categories.map((c) => [c.label, c.spent.cents, c.count]),
    ).toEqual([
      ["Rent", 60000, 1],
      ["Groceries", 22000, 4],
      // Transport and Gym both total 6000; Transport has more entries.
      ["Transport", 6000, 3],
      ["Gym", 6000, 2],
      ["Food", 5000, 2],
      ["Fees", 4800, 4],
      ["Coffee", 2400, 2],
    ]);
  });

  it("shares each category against total spending and averages its entries", () => {
    expect(MAIN.categories[0]).toEqual({
      label: "Rent",
      spent: { cents: 60000, display: "$600.00" },
      count: 1,
      sharePct: 56.5, // 60000 / 106200
      averageEntry: { cents: 60000, display: "$600.00" },
    });
    expect(MAIN.categories[1]).toEqual({
      label: "Groceries",
      spent: { cents: 22000, display: "$220.00" },
      count: 4,
      sharePct: 20.7,
      averageEntry: { cents: 5500, display: "$55.00" }, // 22000 / 4
    });
  });

  it("breaks out only the rows that carry a subcategory", () => {
    expect(
      MAIN.subcategories.map((c) => [c.label, c.spent.cents, c.count]),
    ).toEqual([
      ["Groceries · Supermarket", 22000, 4],
      ["Transport · Taxi", 6000, 3],
      ["Food · Restaurant", 5000, 2],
      ["Fees · Subscriptions", 4800, 4],
    ]);
    // Coffee, Gym and Rent were logged without one, so they have no row here.
    const labels = MAIN.subcategories.map((c) => c.label);
    expect(labels.some((l) => l.startsWith("Coffee"))).toBe(false);
    expect(labels.some((l) => l.startsWith("Rent"))).toBe(false);
    expect(MAIN.subcategories[0]).toMatchObject({
      sharePct: 20.7,
      averageEntry: { cents: 5500, display: "$55.00" },
    });
  });
});

describe("buildDigest — weekdays", () => {
  it("returns all seven days, zero-filled where nothing was spent", () => {
    expect(MAIN.weekdaysLogged.map((w) => w.label)).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    expect(MAIN.weekdaysLogged.map((w) => [w.count, w.spent.cents])).toEqual([
      [0, 0], //     Sunday — nothing was ever logged on one
      [3, 9400], //  Mondays: Jun 1, Jun 8, Aug 3
      [5, 20000], // Tuesdays: Jun 2 (×2), Jun 9, Jun 16, Aug 4
      [3, 4000], //  Wednesdays: Jun 3, Jun 10, Aug 5
      [3, 6000], //  Thursdays: Jun 4, Jun 11, Jun 18
      [2, 6000], //  Fridays: Jun 5, Jun 12
      [2, 60800], // Saturdays: Jun 20, Aug 1
    ]);
    expect(MAIN.weekdaysLogged[0]).toEqual({
      label: "Sunday",
      spent: { cents: 0, display: "$0.00" },
      count: 0,
      sharePct: 0,
    });
    expect(MAIN.weekdaysLogged.map((w) => w.sharePct)).toEqual([
      0, 8.9, 18.8, 3.8, 5.6, 5.6, 57.3,
    ]);
    // The seven days account for the whole of spending.
    const summed = MAIN.weekdaysLogged.reduce((n, w) => n + w.spent.cents, 0);
    expect(summed).toBe(MAIN.totals.spent.cents);
  });

  it("shares Saturday and Sunday against the total", () => {
    // Only Saturdays carry spending here: 800 + 60000 of 106200.
    expect(MAIN.weekendSharePct).toBe(57.3);
  });
});

describe("buildDigest — the biggest single expenses", () => {
  it("lists them largest first, capped at five, labelled by base category", () => {
    expect(MAIN.largestExpenses).toEqual([
      { date: "2026-08-01", category: "Rent", amount: { cents: 60000, display: "$600.00" } },
      { date: "2026-08-03", category: "Groceries", amount: { cents: 7000, display: "$70.00" } },
      { date: "2026-06-02", category: "Groceries", amount: { cents: 5000, display: "$50.00" } },
      { date: "2026-06-09", category: "Groceries", amount: { cents: 5000, display: "$50.00" } },
      { date: "2026-06-16", category: "Groceries", amount: { cents: 5000, display: "$50.00" } },
    ]);
    // 18 expenses went in; only five come out.
    expect(MAIN.largestExpenses).toHaveLength(5);
  });
});

describe("buildDigest — charges that repeat", () => {
  it("keeps a group of three or more at one amount and drops a pair", () => {
    expect(
      MAIN.repeatedCharges.map((r) => [r.category, r.amount.cents, r.count]),
    ).toEqual([
      ["Fees", 1200, 4], //      Jun 1, 3, 8, 10
      // Both have three; the bigger amount leads.
      ["Groceries", 5000, 3], // Jun 2, 9, 16
      ["Transport", 2000, 3], // Jun 4, 11, 18
    ]);
    // Food at 2500 landed twice and Gym at 3000 twice — neither qualifies.
    expect(MAIN.repeatedCharges.map((r) => r.category)).not.toContain("Food");
    expect(MAIN.repeatedCharges.map((r) => r.category)).not.toContain("Gym");
  });

  it("takes the median of the gaps, odd or even", () => {
    // Fees: gaps of 2, 5, 2 days → median 2 (three gaps, odd).
    expect(MAIN.repeatedCharges[0].medianGapDays).toBe(2);
    // Groceries: gaps of 7 and 7 → mean of the middle two (even).
    expect(MAIN.repeatedCharges[1].medianGapDays).toBe(7);
    expect(MAIN.repeatedCharges[1].amount.display).toBe("$50.00");
  });
});

describe("buildDigest — first month against last", () => {
  it("compares each category and names the direction", () => {
    expect(
      MAIN.monthOverMonth.map((c) => [
        c.category,
        c.first.cents,
        c.last.cents,
        c.changePct,
        c.direction,
      ]),
    ).toEqual([
      // Sorted by what was spent in the last month.
      ["Rent", 0, 60000, null, "new"], //           absent in June
      ["Groceries", 15000, 7000, -53.3, "down"],
      ["Food", 2500, 2500, 0, "flat"],
      ["Coffee", 800, 1600, 100, "up"],
      ["Fees", 4800, 0, -100, "down"], //           absent in August
      ["Transport", 6000, 0, -100, "down"],
      ["Gym", 6000, 0, -100, "down"],
    ]);
    expect(MAIN.monthOverMonth[0].last.display).toBe("$600.00");
    expect(MAIN.monthOverMonth[1].first.display).toBe("$150.00");
  });

  it("has nothing to compare in a one-month window", () => {
    const digest = buildDigest(
      [out("food", 2500, at(2026, 7, 4)), out("coffee", 400, at(2026, 7, 9))],
      win(new Date(2026, 7, 1), new Date(2026, 8, 1), "last_month"),
      "USD",
    );
    expect(digest.period.months).toBe(1);
    expect(digest.months).toHaveLength(1);
    expect(digest.monthOverMonth).toEqual([]);
    expect(digest.totals.spent.cents).toBe(2900);
  });
});

describe("buildDigest — the guarantees it makes", () => {
  it("never carries note text, even when every row has one", () => {
    // Guard against passing vacuously: the fixture really is all notes.
    expect(MAIN_ROWS.every((r) => (r.note ?? "").includes("SECRETNOTE"))).toBe(true);
    expect(MAIN_ROWS).toHaveLength(21);
    const serialized = JSON.stringify(MAIN);
    expect(serialized).not.toContain("SECRETNOTE");
    expect(serialized).not.toContain("note");
    // …and no row ids either, which would tie a figure back to a single entry.
    expect(serialized).not.toContain(MAIN_ROWS[0].id);
  });

  it("produces zeros rather than NaN over an empty window", () => {
    const instant = new Date(2026, 5, 1);
    const digest = buildDigest(MAIN_ROWS, win(instant, instant, "last_month"), "USD");

    expect(digest.period.days).toBe(0);
    expect(digest.period.months).toBe(0);
    expect(digest.months).toEqual([]);
    expect(digest.monthOverMonth).toEqual([]);

    const zero = { cents: 0, display: "$0.00" };
    expect(digest.totals).toEqual({
      spent: zero,
      income: zero,
      net: zero,
      spendCount: 0,
      entryCount: 0,
      dailyAverage: zero, //          divided by 0 days
      perLoggedDayAverage: zero, //   divided by 0 logged days
      medianExpense: zero, //         the median of nothing
      averageExpense: zero, //        divided by 0 expenses
    });
    expect(digest.coverage).toEqual({
      days: 0,
      daysLogged: 0,
      daysWithNothingLogged: 0,
      daysWithNoSpending: 0,
      coveragePct: 0, //      a share of 0 days
      longestGapDays: 0,
      busiestDay: null,
    });
    expect(digest.weekendSharePct).toBe(0); // a share of 0 spending
    expect(digest.weekdaysLogged.every((w) => w.sharePct === 0)).toBe(true);
    expect(digest.categories).toEqual([]);
    expect(digest.subcategories).toEqual([]);
    expect(digest.largestExpenses).toEqual([]);
    expect(digest.repeatedCharges).toEqual([]);

    // Nothing anywhere in the digest is NaN or Infinity.
    const numbers = numbersIn(digest);
    expect(numbers.length).toBe(40); // 12 totals/coverage + 7 weekdays × 4
    for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
  });

  it("is finite over the populated window too", () => {
    for (const n of numbersIn(MAIN)) expect(Number.isFinite(n)).toBe(true);
  });
});
