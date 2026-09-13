import { describe, it, expect } from "vitest";
import {
  NAME_MAX,
  RARITIES,
  REST_ID,
  RecapDataError,
  SPLIT_SIZE,
  cleanName,
  coverage,
  editionLabel,
  entriesOf,
  monthFacts,
  monthKey,
  monthKeyFromHash,
  nextRarity,
  parseMonthKey,
  rankOf,
  rarityLabel,
  rarityOf,
  rarityStars,
  shareOf,
  shiftMonthKey,
  subEntriesOf,
  subShare,
  type Rarity,
  type MonthFacts,
} from "@/lib/recap";
import type { Transaction } from "@/types/db";

// Fixtures go through the local-time Date constructor (noon unless the test
// is about the hour) so day and hour bucketing is deterministic in any
// timezone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

// 13 Sep 2026, a Sunday: September is 13 days in and has 30.
const NOW = new Date(2026, 8, 13, 12);
const SEP = "2026-09";
// June 2026: a past month with 30 days, so coverage there is days / 30.
const JUN = "2026-06";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1000,
    original_currency: "USD",
    original_amount: 10,
    rate_used: 1,
    occurred_at: at(2026, 8, 10),
    note: null,
    created_at: at(2026, 8, 10),
    ...overrides,
  };
}

// A groceries row on each of the first `n` days of a month.
function rowsOnDays(n: number, key = SEP): Transaction[] {
  const month = parseMonthKey(key)!;
  return Array.from({ length: n }, (_, i) =>
    tx({ id: `d${i + 1}`, occurred_at: at(month.getFullYear(), month.getMonth(), i + 1) }),
  );
}

// Facts for a month logged on its first `n` days.
const logged = (n: number, key = SEP, now = NOW) => monthFacts(rowsOnDays(n, key), key, now);

// Facts for a month with `n` logged days spread as evenly as possible, so
// the coverage tiers can be checked without a long streak muddying them.
function spread(n: number, key: string): MonthFacts {
  const month = parseMonthKey(key)!;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const picked = new Set<number>();
  for (let i = 0; i < n; i++) picked.add(Math.min(days, Math.floor((i * days) / n) + 1));
  const rows = [...picked].map((d) =>
    tx({ id: `s${d}`, occurred_at: at(month.getFullYear(), month.getMonth(), d) }),
  );
  return monthFacts(rows, key, NOW);
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("monthKey", () => {
  it("is the zero-padded local year and month", () => {
    expect(monthKey(new Date(2026, 8, 10, 12))).toBe("2026-09");
    expect(monthKey(new Date(2026, 0, 31, 23, 59))).toBe("2026-01");
  });
});

describe("parseMonthKey", () => {
  it("is local midnight on the first of a well-formed month", () => {
    expect(parseMonthKey("2026-09")).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(parseMonthKey("2026-12")).toEqual(new Date(2026, 11, 1, 0, 0, 0, 0));
  });

  it("is null for anything but YYYY-MM with a real month", () => {
    for (const bad of ["2026-13", "2026-00", "26-09", "2026-9", "2026-09-01", "", "sep 2026"]) {
      expect(parseMonthKey(bad)).toBeNull();
    }
  });

  it("keeps a year under 100 as written instead of reading it as 19xx", () => {
    const date = parseMonthKey("0042-03")!;
    expect(date.getFullYear()).toBe(42);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(1);
  });
});

describe("shiftMonthKey", () => {
  it("moves whole months, across a year boundary either way", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2025-12", 1)).toBe("2026-01");
    expect(shiftMonthKey("2026-09", -12)).toBe("2025-09");
    expect(shiftMonthKey("2026-09", 0)).toBe("2026-09");
  });
});

describe("monthKeyFromHash", () => {
  it("takes a well-formed past month from the query", () => {
    expect(monthKeyFromHash("#/recap?month=2026-08", NOW)).toBe("2026-08");
  });

  it("accepts the current month itself", () => {
    expect(monthKeyFromHash("#/recap?month=2026-09", NOW)).toBe("2026-09");
  });

  it("falls back to the current month for a future, garbage or missing month", () => {
    expect(monthKeyFromHash("#/recap?month=2026-10", NOW)).toBe("2026-09");
    expect(monthKeyFromHash("#/recap?month=garbage", NOW)).toBe("2026-09");
    expect(monthKeyFromHash("#/recap?style=story", NOW)).toBe("2026-09");
    expect(monthKeyFromHash("#/recap", NOW)).toBe("2026-09");
  });
});

describe("editionLabel", () => {
  it("is the short month and year in caps", () => {
    expect(editionLabel(new Date(2026, 8, 1))).toBe("SEP 2026");
  });
});

describe("monthFacts", () => {
  it("is all zeros for an empty past month", () => {
    expect(monthFacts([], "2026-08", NOW)).toEqual({
      key: "2026-08",
      month: new Date(2026, 7, 1, 0, 0, 0, 0),
      current: false,
      daysInMonth: 31,
      daysAvailable: 31,
      totalCents: 0,
      entries: 0,
      categories: [],
      split: [],
      loggedDays: [],
      daysLogged: 0,
      streak: 0,
      weekendShare: 0,
      lateNightShare: 0,
      earlyShare: 0,
      subEntries: {},
      currencies: 0,
      biggestEntryShare: 0,
      busiestDay: 0,
    });
  });

  it("marks the month `now` is in as current, with only the elapsed days available", () => {
    expect(monthFacts([], SEP, NOW)).toMatchObject({
      current: true,
      daysInMonth: 30,
      daysAvailable: 13,
    });
  });

  it("gives a past month every one of its days, however many that is", () => {
    expect(monthFacts([], "2026-02", NOW)).toMatchObject({
      current: false,
      daysInMonth: 28,
      daysAvailable: 28,
    });
  });

  it("ignores rows outside the month in either direction", () => {
    const rows = [
      tx({ id: "before", occurred_at: new Date(2026, 7, 31, 23, 59).toISOString() }),
      tx({ id: "first", occurred_at: new Date(2026, 8, 1, 0, 0).toISOString() }),
      tx({ id: "last", occurred_at: new Date(2026, 8, 30, 23, 59).toISOString() }),
      tx({ id: "after", occurred_at: new Date(2026, 9, 1, 0, 0).toISOString() }),
    ];
    const facts = monthFacts(rows, SEP, NOW);
    expect(facts.loggedDays).toEqual([1, 30]);
    expect(facts.totalCents).toBe(2000);
  });

  it("counts a row once however many times it's given", () => {
    const facts = monthFacts([tx({ id: "dup" }), tx({ id: "dup" })], SEP, NOW);
    expect(facts.totalCents).toBe(1000);
    expect(facts.entries).toBe(1);
    expect(facts.busiestDay).toBe(1);
  });

  it("keeps income and Safe moves out of spending but still logs their days", () => {
    const rows = [
      tx({
        id: "inc",
        is_income: true,
        category: "salary",
        amount_usd_cents: 9999,
        original_currency: "EUR",
        occurred_at: at(2026, 8, 3),
      }),
      tx({ id: "safe", category: "safe", amount_usd_cents: 9999, occurred_at: at(2026, 8, 4) }),
      tx({ id: "spend", amount_usd_cents: 500, occurred_at: at(2026, 8, 5) }),
    ];
    const facts = monthFacts(rows, SEP, NOW);
    expect(facts.totalCents).toBe(500);
    expect(facts.entries).toBe(1);
    expect(facts.currencies).toBe(1); // the EUR was income
    expect(facts.loggedDays).toEqual([3, 4, 5]);
    expect(facts.streak).toBe(3);
  });

  it("logs the day of a zero-amount row without it touching the spending", () => {
    const facts = monthFacts([tx({ amount_usd_cents: 0, occurred_at: at(2026, 8, 7) })], SEP, NOW);
    expect(facts.loggedDays).toEqual([7]);
    expect(facts.totalCents).toBe(0);
    expect(facts.entries).toBe(0);
    expect(facts.categories).toEqual([]);
    expect(facts.split).toEqual([]);
    expect(facts.busiestDay).toBe(0);
  });

  it("files an unknown category under Other, together with real Other rows", () => {
    const rows = [
      tx({ id: "a", category: "mystery", amount_usd_cents: 300 }),
      tx({ id: "b", category: "other", amount_usd_cents: 200 }),
      tx({ id: "c", category: "mystery/thing", amount_usd_cents: 100 }),
    ];
    const facts = monthFacts(rows, SEP, NOW);
    expect(facts.categories).toEqual([
      { id: "other", label: "Other", cents: 600, entries: 3, share: 1 },
    ]);
    expect(facts.subEntries).toEqual({ "other/thing": 1 });
  });

  it("folds subcategories into their base and counts them in subEntries", () => {
    const rows = [
      tx({ id: "a", category: "food/delivery", amount_usd_cents: 300 }),
      tx({ id: "b", category: "food/delivery", amount_usd_cents: 300 }),
      tx({ id: "c", category: "food/restaurant", amount_usd_cents: 300 }),
      tx({ id: "d", category: "food", amount_usd_cents: 100 }),
    ];
    const facts = monthFacts(rows, SEP, NOW);
    expect(facts.categories).toEqual([
      { id: "food", label: "Food", cents: 1000, entries: 4, share: 1 },
    ]);
    expect(facts.subEntries).toEqual({ "food/delivery": 2, "food/restaurant": 1 });
  });

  it("ranks categories by cents, ties broken by id", () => {
    const rows = [
      tx({ id: "a", category: "groceries", amount_usd_cents: 300 }),
      tx({ id: "b", category: "coffee", amount_usd_cents: 300 }),
      tx({ id: "c", category: "gas", amount_usd_cents: 300 }),
      tx({ id: "d", category: "food", amount_usd_cents: 500 }),
    ];
    const facts = monthFacts(rows, SEP, NOW);
    expect(facts.categories.map((c) => c.id)).toEqual(["food", "coffee", "gas", "groceries"]);
    expect(facts.categories.map((c) => c.share)).toEqual([
      500 / 1400,
      300 / 1400,
      300 / 1400,
      300 / 1400,
    ]);
  });

  it("splits into the top three plus Everything else, percents totalling 100", () => {
    const rows = [
      tx({ id: "a", category: "food", amount_usd_cents: 4000 }),
      tx({ id: "b", category: "groceries", amount_usd_cents: 3000 }),
      tx({ id: "c", category: "coffee", amount_usd_cents: 2000 }),
      tx({ id: "d", category: "gas", amount_usd_cents: 600 }),
      tx({ id: "e", category: "fun/drinks", amount_usd_cents: 400 }),
    ];
    const { split } = monthFacts(rows, SEP, NOW);
    expect(split).toHaveLength(SPLIT_SIZE + 1);
    expect(split.map((b) => [b.id, b.percent])).toEqual([
      ["food", 40],
      ["groceries", 30],
      ["coffee", 20],
      [REST_ID, 10],
    ]);
    expect(split[3]).toEqual({
      id: REST_ID,
      label: "Everything else",
      cents: 1000,
      entries: 2,
      share: 0.1,
      percent: 10,
    });
  });

  it("has no Everything else when three or fewer categories cover it all", () => {
    const three = monthFacts(
      [
        tx({ id: "a", category: "food", amount_usd_cents: 500 }),
        tx({ id: "b", category: "groceries", amount_usd_cents: 300 }),
        tx({ id: "c", category: "coffee", amount_usd_cents: 200 }),
      ],
      SEP,
      NOW,
    );
    expect(three.split.map((b) => [b.id, b.percent])).toEqual([
      ["food", 50],
      ["groceries", 30],
      ["coffee", 20],
    ]);
    const one = monthFacts([tx()], SEP, NOW);
    expect(one.split.map((b) => [b.id, b.percent])).toEqual([["groceries", 100]]);
  });

  it("rounds to whole percents that still total 100, largest remainders first", () => {
    // 60.1% / 39.9%: the point the floors lose goes to the bigger remainder.
    const uneven = monthFacts(
      [
        tx({ id: "a", category: "food", amount_usd_cents: 601 }),
        tx({ id: "b", category: "groceries", amount_usd_cents: 399 }),
      ],
      SEP,
      NOW,
    );
    expect(uneven.split.map((b) => b.percent)).toEqual([60, 40]);
    // Three equal thirds: the remainders tie, so the point goes to the first shown.
    const thirds = monthFacts(
      [
        tx({ id: "a", category: "groceries", amount_usd_cents: 100 }),
        tx({ id: "b", category: "food", amount_usd_cents: 100 }),
        tx({ id: "c", category: "coffee", amount_usd_cents: 100 }),
      ],
      SEP,
      NOW,
    );
    expect(thirds.split.map((b) => [b.id, b.percent])).toEqual([
      ["coffee", 34],
      ["food", 33],
      ["groceries", 33],
    ]);
  });

  it("measures weekend rows against all rows, not by amount", () => {
    // 11, 12 and 13 Sep 2026: a Friday, Saturday and Sunday. The Friday row
    // is the big one, but the habit is two weekend entries out of three.
    const rows = [
      tx({ id: "fri", amount_usd_cents: 500, occurred_at: at(2026, 8, 11) }),
      tx({ id: "sat", amount_usd_cents: 300, occurred_at: at(2026, 8, 12) }),
      tx({ id: "sun", amount_usd_cents: 200, occurred_at: at(2026, 8, 13) }),
    ];
    expect(monthFacts(rows, SEP, NOW).weekendShare).toBe(2 / 3);
  });

  it("classifies spending rows by hour: late night, early, or neither", () => {
    const rows = [22, 23, 0, 4, 5, 8, 9, 21].map((h) =>
      tx({ id: `h${h}`, occurred_at: at(2026, 8, 10, h) }),
    );
    const facts = monthFacts(rows, SEP, NOW);
    expect(facts.lateNightShare).toBe(4 / 8); // 22, 23, 0, 4
    expect(facts.earlyShare).toBe(2 / 8); // 5, 8
  });

  it("counts the distinct currencies the spending was typed in", () => {
    const rows = [
      tx({ id: "a", original_currency: "USD" }),
      tx({ id: "b", original_currency: "EUR" }),
      tx({ id: "c", original_currency: "USD" }),
      tx({ id: "d", original_currency: "LBP" }),
    ];
    expect(monthFacts(rows, SEP, NOW).currencies).toBe(3);
  });

  it("sizes the biggest single row against the total", () => {
    const rows = [
      tx({ id: "a", amount_usd_cents: 100 }),
      tx({ id: "b", amount_usd_cents: 600 }),
      tx({ id: "c", amount_usd_cents: 300 }),
    ];
    expect(monthFacts(rows, SEP, NOW).biggestEntryShare).toBe(0.6);
  });

  it("finds the day with the most spending rows", () => {
    const rows = [
      tx({ id: "a", occurred_at: at(2026, 8, 5, 8) }),
      tx({ id: "b", occurred_at: at(2026, 8, 5, 13) }),
      tx({ id: "c", occurred_at: at(2026, 8, 5, 20) }),
      tx({ id: "d", occurred_at: at(2026, 8, 6) }),
    ];
    expect(monthFacts(rows, SEP, NOW).busiestDay).toBe(3);
  });

  it("finds the longest run of consecutive logged days", () => {
    const rows = [9, 3, 10, 5, 4].map((d) => tx({ id: `d${d}`, occurred_at: at(2026, 8, d) }));
    const facts = monthFacts(rows, SEP, NOW);
    expect(facts.loggedDays).toEqual([3, 4, 5, 9, 10]);
    expect(facts.daysLogged).toBe(5);
    expect(facts.streak).toBe(3);
    expect(monthFacts([tx()], SEP, NOW).streak).toBe(1);
  });

  it("refuses a row it can't trust rather than quietly dropping it", () => {
    const masked = tx({ amount_usd_cents: 0, amountMask: "xx" });
    for (const row of [masked, tx({ amount_usd_cents: NaN }), tx({ amount_usd_cents: -1 })]) {
      expect(() => monthFacts([row], SEP, NOW)).toThrow(RecapDataError);
    }
    expect(thrown(() => monthFacts([masked], SEP, NOW))).toMatchObject({
      name: "RecapDataError",
      message: "invalid",
    });
  });
});

describe("category lookups", () => {
  // food: 1000 cents over 4 rows, 2 of them delivery; groceries: 500 over 1.
  const facts = monthFacts(
    [
      tx({ id: "a", category: "food/delivery", amount_usd_cents: 300 }),
      tx({ id: "b", category: "food/delivery", amount_usd_cents: 300 }),
      tx({ id: "c", category: "food", amount_usd_cents: 200 }),
      tx({ id: "d", category: "food", amount_usd_cents: 200 }),
      tx({ id: "e", category: "groceries", amount_usd_cents: 500 }),
    ],
    SEP,
    NOW,
  );

  it("shareOf, rankOf and entriesOf read a category, 0 when it isn't there", () => {
    expect(shareOf(facts, "food")).toBe(1000 / 1500);
    expect(shareOf(facts, "gym")).toBe(0);
    expect(rankOf(facts, "food")).toBe(1);
    expect(rankOf(facts, "groceries")).toBe(2);
    expect(rankOf(facts, "gym")).toBe(0);
    expect(entriesOf(facts, "food")).toBe(4);
    expect(entriesOf(facts, "gym")).toBe(0);
  });

  it("subEntriesOf and subShare read a subcategory, 0 when it or its parent isn't there", () => {
    expect(subEntriesOf(facts, "food", "delivery")).toBe(2);
    expect(subEntriesOf(facts, "food", "snacks")).toBe(0);
    expect(subShare(facts, "food", "delivery")).toBe(0.5);
    expect(subShare(facts, "food", "snacks")).toBe(0);
    expect(subShare(facts, "gym", "anything")).toBe(0);
  });
});

describe("coverage", () => {
  it("is days logged over days available", () => {
    expect(coverage(logged(18, JUN))).toBe(0.6); // 18 of June's 30
    expect(coverage(logged(6))).toBe(6 / 13); // 6 of the 13 elapsed
  });

  it("measures against at least a week early in a month", () => {
    const third = new Date(2026, 8, 3, 12);
    expect(coverage(logged(3, SEP, third))).toBe(3 / 7);
  });

  it("never exceeds 1, even with rows dated later in the current month", () => {
    const rows = [...rowsOnDays(13), tx({ id: "later", occurred_at: at(2026, 8, 25) })];
    expect(coverage(monthFacts(rows, SEP, NOW))).toBe(1);
  });
});

describe("rarityOf", () => {
  it("steps up at each coverage threshold, inclusive", () => {
    expect(spread(0, JUN).daysLogged).toBe(0);
    expect(rarityOf(spread(0, JUN))).toBe("common");
    expect(rarityOf(spread(10, JUN))).toBe("common"); // 0.33
    expect(rarityOf(spread(17, JUN))).toBe("uncommon"); // 0.57
    expect(rarityOf(spread(18, JUN))).toBe("rare"); // 0.6
    expect(rarityOf(spread(23, JUN))).toBe("rare"); // 0.77
    expect(rarityOf(spread(24, JUN))).toBe("epic"); // 0.8
    expect(rarityOf(spread(29, JUN))).toBe("epic"); // 0.97
    expect(rarityOf(spread(30, JUN))).toBe("legendary");
  });

  it("lets a long streak earn a tier the coverage alone wouldn't", () => {
    // Ten straight days in June is 0.33 coverage — Common by that measure —
    // but a week-plus streak is Uncommon; two weeks is Rare; three, Epic.
    expect(rarityOf(logged(10, JUN))).toBe("uncommon");
    expect(rarityOf(logged(14, JUN))).toBe("rare");
    expect(rarityOf(logged(21, JUN))).toBe("epic");
    // Legendary is coverage only: 29 straight days is still Epic.
    expect(rarityOf(logged(29, JUN))).toBe("epic");
  });

  it("turns uncommon at exactly 0.35", () => {
    // 20 days into September: 6 or 7 of 20.
    const twentieth = new Date(2026, 8, 20, 12);
    expect(rarityOf(logged(6, SEP, twentieth))).toBe("common"); // 0.3
    expect(rarityOf(logged(7, SEP, twentieth))).toBe("uncommon"); // 0.35
  });
});

describe("rarityLabel / rarityStars", () => {
  it("map each tier to its label and 1..5 stars, in order", () => {
    const tiers: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
    expect(RARITIES.map((r) => r.id)).toEqual(tiers);
    expect(tiers.map(rarityLabel)).toEqual(["Common", "Uncommon", "Rare", "Epic", "Legendary"]);
    expect(tiers.map(rarityStars)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("nextRarity", () => {
  it("is null for a past month: nothing can be added to it", () => {
    expect(nextRarity(logged(3, JUN))).toBeNull();
  });

  it("is null once the month is Legendary", () => {
    expect(nextRarity(logged(13))).toBeNull(); // every day so far
  });

  it("names the next tier and the days still to log to reach it by month's end", () => {
    // 10 Sep, 6 of 10 days logged: Rare. Epic needs ceil(0.8 * 30) = 24 days.
    const tenth = new Date(2026, 8, 10, 12);
    expect(nextRarity(logged(6, SEP, tenth))).toEqual({ rarity: "epic", days: 18 });
    // Nothing logged yet: Uncommon needs ceil(0.35 * 30) = 11.
    expect(nextRarity(logged(0))).toEqual({ rarity: "uncommon", days: 11 });
    // Against the week floor 3 of 3 on the 3rd is only Uncommon; Rare needs 18.
    const third = new Date(2026, 8, 3, 12);
    expect(nextRarity(logged(3, SEP, third))).toEqual({ rarity: "rare", days: 15 });
  });

  it("is null when the days left in the month can't reach the next tier", () => {
    // 28 Sep with only the first three days logged: Uncommon needs 8 more,
    // but today and the two days after it are all that's left.
    const late = new Date(2026, 8, 28, 12);
    expect(nextRarity(logged(3, SEP, late))).toBeNull();
    // Today counts only while it's still unlogged: on the 29th with the
    // 29th itself logged, two days remain — still not enough for the 8.
    const rows = [...rowsOnDays(3), tx({ id: "today", occurred_at: at(2026, 8, 29) })];
    expect(nextRarity(monthFacts(rows, SEP, new Date(2026, 8, 29, 12)))).toBeNull();
    // On the 20th with today logged, ten days remain: enough for the 6 more.
    const rows2 = [...rowsOnDays(4), tx({ id: "today", occurred_at: at(2026, 8, 20) })];
    expect(nextRarity(monthFacts(rows2, SEP, new Date(2026, 8, 20, 12)))).toEqual({
      rarity: "uncommon",
      days: 6,
    });
  });
});

describe("cleanName", () => {
  it("trims and collapses runs of whitespace", () => {
    expect(cleanName("  Nizar   M  ")).toBe("Nizar M");
  });

  it("strips control and format characters", () => {
    // A zero-width space, a NUL and a byte-order mark.
    expect(cleanName("Ni\u200Bzar\u0000 \uFEFFM")).toBe("Nizar M");
  });

  it("is empty for nothing but whitespace or invisible characters", () => {
    expect(cleanName("")).toBe("");
    expect(cleanName("   ")).toBe("");
    expect(cleanName("\u200B\u0007")).toBe("");
  });

  it("caps at NAME_MAX code points, an emoji counting as one", () => {
    expect(cleanName("a".repeat(NAME_MAX + 5))).toBe("a".repeat(NAME_MAX));
    expect(cleanName("🙂".repeat(NAME_MAX + 1))).toBe("🙂".repeat(NAME_MAX));
    // The cut can't leave a trailing space behind.
    expect(cleanName(`${"a".repeat(NAME_MAX - 1)} b`)).toBe("a".repeat(NAME_MAX - 1));
  });
});

describe("defaults", () => {
  it("fall back to the real clock when `now` isn't given", () => {
    const thisMonth = monthKey(new Date());
    expect(monthKeyFromHash("#/recap")).toBe(thisMonth);
    expect(monthFacts([], thisMonth).current).toBe(true);
  });
});
