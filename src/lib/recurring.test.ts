import { describe, it, expect } from "vitest";
import {
  MERGE_DAYS,
  PRICE_CHANGE_TOLERANCE,
  SAME_PRICE_TOLERANCE,
  aliveForDays,
  breakAfterDays,
  cadenceOf,
  detectRecurring,
  fitsCadence,
  minOccurrences,
  monthlyEquivalent,
  pickCadence,
  priceTrack,
} from "@/lib/recurring";
import type { Transaction } from "@/types/db";

// Fixtures go through the local-time Date constructor at noon so day gaps are
// whole numbers in any timezone.
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

// June 10, 2026.
const NOW = new Date(2026, 5, 10, 15);

let seq = 0;
function tx(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: "u1",
    is_income: false,
    category: "fees/subscriptions",
    amount_usd_cents: 1599,
    original_currency: "USD",
    original_amount: 15.99,
    rate_used: 1,
    occurred_at: at(2026, 5, 1),
    note: "Netflix",
    created_at: at(2026, 5, 1),
    ...overrides,
  };
}

/** `n` copies of an entry, one per month, ending in the given month. */
function monthly(
  n: number,
  overrides: Partial<Transaction> = {},
  endMonth = 5,
  day = 1,
): Transaction[] {
  const rows: Transaction[] = [];
  for (let i = n - 1; i >= 0; i--) {
    rows.push(tx({ ...overrides, occurred_at: at(2026, endMonth - i, day) }));
  }
  return rows;
}

describe("cadenceOf", () => {
  it("names the cadence when every gap fits its window", () => {
    expect(cadenceOf([7, 7, 8])).toBe("weekly");
    expect(cadenceOf([14, 13])).toBe("biweekly");
    expect(cadenceOf([31, 30, 28])).toBe("monthly");
    expect(cadenceOf([365, 366])).toBe("yearly");
  });

  it("forgives a log that's a couple of days late or early", () => {
    expect(cadenceOf([33, 25])).toBe("monthly");
  });

  it("allows one skipped log in between, but not a series made of skips", () => {
    expect(cadenceOf([30, 61, 31])).toBe("monthly");
    expect(cadenceOf([7, 14])).toBe("weekly");
    expect(cadenceOf([14, 14])).toBe("biweekly");
    expect(cadenceOf([60, 60, 30])).toBeNull(); // more skips than not
  });

  it("is null when the spacing is irregular, or there are no gaps", () => {
    expect(cadenceOf([1, 1, 2])).toBeNull(); // daily coffee
    expect(cadenceOf([30, 7])).toBeNull(); // mixed
    expect(cadenceOf([3, 3])).toBeNull(); // between weekly and nothing
    expect(cadenceOf([])).toBeNull();
  });
});

describe("pickCadence / fitsCadence", () => {
  it("reads the cadence off the typical gap, even when some gaps stray", () => {
    expect(pickCadence([30, 30, 95, 30])).toBe("monthly"); // a long break in the middle
    expect(pickCadence([61, 30, 60])).toBe("monthly"); // typical gap only fits twice over
    expect(pickCadence([300])).toBeNull();
  });

  it("checks the gaps keep to a cadence", () => {
    expect(fitsCadence("monthly", [30, 61, 31])).toBe(true);
    expect(fitsCadence("monthly", [30, 95])).toBe(false);
    expect(fitsCadence("weekly", [14, 14])).toBe(false); // all skips
    expect(fitsCadence("weekly", [])).toBe(true);
  });
});

describe("breakAfterDays / aliveForDays", () => {
  it("scale with the cadence", () => {
    expect(breakAfterDays("weekly")).toBe(18);
    expect(breakAfterDays("monthly")).toBe(74);
    expect(aliveForDays("weekly")).toBe(16);
    expect(aliveForDays("monthly")).toBe(67);
    expect(aliveForDays("yearly")).toBe(745);
  });
});

describe("monthlyEquivalent", () => {
  it("normalises each cadence to a per-month figure", () => {
    expect(monthlyEquivalent(1200, "monthly")).toBe(1200);
    expect(monthlyEquivalent(1200, "weekly")).toBe(5200);
    expect(monthlyEquivalent(1200, "biweekly")).toBe(2600);
    expect(monthlyEquivalent(1200, "yearly")).toBe(100);
  });
});

describe("priceTrack", () => {
  it("holds steady within the tolerance and reports no previous price", () => {
    expect(SAME_PRICE_TOLERANCE).toBe(0.1);
    // The latest amount is the current price.
    expect(priceTrack([1000, 1050, 980])).toEqual({ current: 980, previous: null, kept: [true, true, true] });
    expect(priceTrack([1000])).toEqual({ current: 1000, previous: null, kept: [true] });
  });

  it("accepts a price change once the old price has held for two entries", () => {
    expect(PRICE_CHANGE_TOLERANCE).toBe(0.5);
    expect(priceTrack([1599, 1599, 1999])).toMatchObject({ current: 1999, previous: 1599 });
    expect(priceTrack([1599, 1599, 1999, 1999, 2499])).toMatchObject({ current: 2499, previous: 1999 });
  });

  it("sets aside the odd one out, as long as they stay a minority", () => {
    // Muay Thai 600, 600, a $15 bottle of water, 600.
    expect(priceTrack([60000, 60000, 1500, 60000])).toEqual({
      current: 60000, previous: null, kept: [true, true, false, true],
    });
    // A change that came too soon is an odd one out too, and the current
    // price is the latest amount that belongs.
    expect(priceTrack([1599, 1999, 1599])).toEqual({ current: 1599, previous: null, kept: [true, false, true] });
    expect(priceTrack([1599, 1599, 1999, 1999, 2499, 800])).toMatchObject({ current: 2499, previous: 1999 });
  });

  it("gives up when the odd ones out are as many as the rest", () => {
    expect(priceTrack([1599, 1999])).toBeNull(); // old price never held
    expect(priceTrack([1000, 1000, 1600, 1700])).toBeNull(); // two of four
    expect(priceTrack([5000, 9000, 5200, 8800])).toBeNull(); // groceries, not a bill
  });
});

describe("detectRecurring", () => {
  it("needs two occurrences for monthly and yearly, three for the short cadences", () => {
    expect(minOccurrences("monthly")).toBe(2);
    expect(minOccurrences("yearly")).toBe(2);
    expect(minOccurrences("weekly")).toBe(3);
    expect(minOccurrences("biweekly")).toBe(3);
    // Two entries a week apart prove little on their own…
    const twoWeekly = [0, 7].map((d) =>
      tx({ category: "gym", note: null, amount_usd_cents: 2500, occurred_at: at(2026, 5, 1 + d) }),
    );
    expect(detectRecurring(twoWeekly, "u1", NOW).payments).toHaveLength(0);
    // …three do.
    const threeWeekly = [0, 7, 14].map((d) =>
      tx({ category: "gym", note: null, amount_usd_cents: 2500, occurred_at: at(2026, 4, 25 + d) }),
    );
    expect(detectRecurring(threeWeekly, "u1", NOW).payments[0].cadence).toBe("weekly");
  });

  it("finds a monthly subscription from two matching entries", () => {
    const rows = monthly(2); // May 1, Jun 1
    const { payments, monthlyOutCents, monthlyInCents, anyMasked } = detectRecurring(
      rows,
      "u1",
      NOW,
    );
    expect(payments).toHaveLength(1);
    const p = payments[0];
    expect(p.key).toBe("false:fees/subscriptions:netflix");
    expect(p.category).toBe("fees/subscriptions");
    expect(p.isIncome).toBe(false);
    expect(p.note).toBe("Netflix");
    expect(p.cadence).toBe("monthly");
    expect(p.fromNote).toBe(false);
    expect(p.amountCents).toBe(1599);
    expect(p.previousAmountCents).toBeNull();
    expect(p.monthlyCents).toBe(1599);
    expect(p.count).toBe(2);
    expect(p.firstAt).toBe(at(2026, 4, 1));
    expect(p.lastAt).toBe(at(2026, 5, 1));
    // Due 30 days after Jun 1 — still ahead of Jun 10.
    expect(p.nextDueAt).toBe(at(2026, 6, 1));
    expect(p.overdue).toBe(false);
    // Occurrences come back newest first.
    expect(p.rows.map((r) => r.occurred_at)).toEqual([at(2026, 5, 1), at(2026, 4, 1)]);
    expect(monthlyOutCents).toBe(1599);
    expect(monthlyInCents).toBe(0);
    expect(anyMasked).toBe(false);
  });

  it("needs at least two occurrences without a hint", () => {
    expect(detectRecurring(monthly(1), "u1", NOW).payments).toHaveLength(0);
  });

  it("only ever counts the given user's rows", () => {
    const rows = [...monthly(3), ...monthly(3, { user_id: "u2", note: "Spotify" })];
    const mine = detectRecurring(rows, "u1", NOW).payments;
    expect(mine).toHaveLength(1);
    expect(mine[0].note).toBe("Netflix");
    expect(detectRecurring(rows, "u3", NOW).payments).toHaveLength(0);
  });

  it("splits a category by note, so two subscriptions don't merge", () => {
    const rows = [
      ...monthly(3),
      ...monthly(3, { note: " spotify ", amount_usd_cents: 999 }, 5, 15),
    ];
    const { payments } = detectRecurring(rows, "u1", NOW);
    expect(payments.map((p) => p.note)).toEqual(["Netflix", "spotify"]);
    expect(payments[1].amountCents).toBe(999);
  });

  it("folds notes that mean the same thing into one series", () => {
    const rows = [
      tx({ note: "Netflix", occurred_at: at(2026, 2, 1) }),
      tx({ note: "netflix sub", occurred_at: at(2026, 3, 1) }),
      tx({ note: "Netlfix", occurred_at: at(2026, 4, 1) }),
      tx({ note: "NETFLIX family", occurred_at: at(2026, 5, 1) }),
    ];
    const { payments } = detectRecurring(rows, "u1", NOW);
    expect(payments).toHaveLength(1);
    expect(payments[0].count).toBe(4);
    // Named by the latest note, keyed by it too.
    expect(payments[0].note).toBe("NETFLIX family");
    expect(payments[0].key).toBe("false:fees/subscriptions:netflix family");
  });

  it("keeps a tagged note out of the untagged series of the same name", () => {
    const rows = [
      // The Claude that has been running for months…
      ...monthly(4, { note: "Claude subscription", amount_usd_cents: 2000 }),
      // …and a second one, on its first entry, tagged to say which it is.
      tx({
        note: "Claude (taktekbot) (monthly)",
        amount_usd_cents: 10000,
        occurred_at: at(2026, 5, 4),
      }),
    ];
    const { payments, monthlyOutCents } = detectRecurring(rows, "u1", NOW);
    expect(payments.map((p) => [p.note, p.count, p.amountCents])).toEqual([
      ["Claude", 4, 2000],
      ["Claude (taktekbot)", 1, 10000],
    ]);
    // Two payments, so the total is both — not one series with a price hike.
    expect(monthlyOutCents).toBe(12000);
  });

  it("folds a tagged note together with the same tag written plainly", () => {
    const rows = [
      tx({ note: "Claude (taktekbot) (monthly)", occurred_at: at(2026, 4, 4) }),
      tx({ note: "Claude taktekbot", occurred_at: at(2026, 5, 4) }),
    ];
    const { payments } = detectRecurring(rows, "u1", NOW);
    expect(payments.map((p) => [p.note, p.count])).toEqual([["Claude taktekbot", 2]]);
  });

  it("groups note-less entries by category alone, apart from the noted ones", () => {
    const rows = [
      ...monthly(4, { category: "rent", note: null, amount_usd_cents: 80000 }),
      ...monthly(3, { category: "rent", note: "parking spot", amount_usd_cents: 5000 }, 5, 15),
    ];
    const { payments } = detectRecurring(rows, "u1", NOW);
    expect(payments.map((p) => [p.note, p.count])).toEqual([
      [null, 4],
      ["parking spot", 3],
    ]);
    expect(payments[0].key).toBe("false:rent:");
  });

  it("treats a blank note like no note", () => {
    const rows = monthly(3, { category: "rent", note: "   ", amount_usd_cents: 80000 });
    expect(detectRecurring(rows, "u1", NOW).payments[0].note).toBeNull();
  });

  it("takes a cadence hint in the note at its word, even for a single entry", () => {
    const rows = [tx({ category: "fees", note: "Insurance (yearly)", amount_usd_cents: 1200, occurred_at: at(2026, 0, 15) })];
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.cadence).toBe("yearly");
    expect(p.fromNote).toBe(true);
    expect(p.note).toBe("Insurance");
    expect(p.count).toBe(1);
    expect(p.monthlyCents).toBe(100);
    expect(p.nextDueAt).toBe(at(2027, 0, 15));
    expect(p.overdue).toBe(false);
  });

  it("lets the latest hint override what the dates say", () => {
    // Logged monthly by mistake at first; the newest note says weekly.
    const rows = [
      tx({ category: "gym", note: "Gym", amount_usd_cents: 2500, occurred_at: at(2026, 3, 1) }),
      tx({ category: "gym", note: "Gym (monthly)", amount_usd_cents: 2500, occurred_at: at(2026, 4, 1) }),
      tx({ category: "gym", note: "Gym (weekly)", amount_usd_cents: 2500, occurred_at: at(2026, 5, 1) }),
    ];
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.cadence).toBe("weekly");
    expect(p.note).toBe("Gym");
  });

  it("rejects irregular spacing (daily coffee is not a subscription)", () => {
    const rows = [1, 4, 7, 12].map((d) =>
      tx({ category: "coffee", note: null, amount_usd_cents: 350, occurred_at: at(2026, 5, d) }),
    );
    expect(detectRecurring(rows, "u1", NOW).payments).toHaveLength(0);
  });

  it("counts entries logged a day or two apart as one occurrence", () => {
    expect(MERGE_DAYS).toBe(2);
    // Netflix logged twice on May 1/2 by mistake, then Jun 1.
    const rows = [
      tx({ occurred_at: at(2026, 4, 1) }),
      tx({ occurred_at: at(2026, 4, 2) }),
      tx({ occurred_at: at(2026, 5, 1) }),
    ];
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.cadence).toBe("monthly");
    expect(p.count).toBe(2);
    expect(p.rows).toHaveLength(3);
    // Daily coffee all folds into one occurrence — not recurring.
    const coffee = [1, 2, 3, 4].map((d) =>
      tx({ category: "coffee", note: null, amount_usd_cents: 350, occurred_at: at(2026, 5, d) }),
    );
    expect(detectRecurring(coffee, "u1", NOW).payments).toHaveLength(0);
  });

  it("keeps a series through a price change and reports the old price", () => {
    const rows = [
      tx({ amount_usd_cents: 1599, occurred_at: at(2026, 2, 1) }),
      tx({ amount_usd_cents: 1599, occurred_at: at(2026, 3, 1) }),
      tx({ amount_usd_cents: 1999, occurred_at: at(2026, 4, 1) }),
      tx({ amount_usd_cents: 1999, occurred_at: at(2026, 5, 1) }),
    ];
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.amountCents).toBe(1999);
    expect(p.previousAmountCents).toBe(1599);
    expect(p.monthlyCents).toBe(1999);
  });

  it("leaves an odd amount out of the series instead of dropping the series", () => {
    const rows = [
      tx({ category: "gym", note: "Muay Thai", amount_usd_cents: 61000, occurred_at: at(2026, 2, 18) }),
      tx({ category: "gym", note: "Muay Thai", amount_usd_cents: 60000, occurred_at: at(2026, 3, 24) }),
      tx({ category: "gym", note: "Muay Thai", amount_usd_cents: 60000, occurred_at: at(2026, 4, 28) }),
      tx({ category: "gym", note: "Muay Thai water", amount_usd_cents: 1500, occurred_at: at(2026, 4, 28) }),
    ];
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.cadence).toBe("monthly");
    expect(p.count).toBe(3);
    expect(p.rows).toHaveLength(3); // the water isn't in the series
    expect(p.amountCents).toBe(60000);
  });

  it("takes the amounts as they come when the note vouched for the series", () => {
    // Google Workspace: seats added every month, the note says subscription.
    const rows = [
      tx({ category: "work", note: "Google workspace", amount_usd_cents: 1600, occurred_at: at(2026, 2, 1) }),
      tx({ category: "work", note: "Google workspace", amount_usd_cents: 3241, occurred_at: at(2026, 3, 1) }),
      tx({ category: "work", note: "Google workspace subscription", amount_usd_cents: 6384, occurred_at: at(2026, 4, 1) }),
      tx({ category: "work", note: "Google workspace", amount_usd_cents: 6384, occurred_at: at(2026, 5, 1) }),
    ];
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.count).toBe(4);
    expect(p.amountCents).toBe(6384);
    expect(p.previousAmountCents).toBe(3241);
    // Steady prices report no previous one.
    const steady = rows.map((r) => ({ ...r, amount_usd_cents: 6384 }));
    expect(detectRecurring(steady, "u1", NOW).payments[0].previousAmountCents).toBeNull();
  });

  it("stops a series whose latest entry says it ended", () => {
    const rows = [
      ...monthly(2, { note: "Framer subscription", amount_usd_cents: 1500 }, 4),
      tx({ note: "Framer subscription (ended)", amount_usd_cents: 1500, occurred_at: at(2026, 5, 1) }),
    ];
    expect(detectRecurring(rows, "u1", NOW).payments).toHaveLength(0);
    // An older "ended" doesn't stop a series that came back.
    const back = [
      tx({ note: "Framer (ended)", amount_usd_cents: 1500, occurred_at: at(2026, 3, 1) }),
      tx({ note: "Framer", amount_usd_cents: 1500, occurred_at: at(2026, 4, 1) }),
      tx({ note: "Framer", amount_usd_cents: 1500, occurred_at: at(2026, 5, 1) }),
    ];
    expect(detectRecurring(back, "u1", NOW).payments).toHaveLength(1);
  });

  it("takes a domain name as a yearly series from its first entry", () => {
    const rows = [
      tx({ category: "work", note: "sillyguy.com subscription", amount_usd_cents: 1868, occurred_at: at(2026, 5, 8) }),
      tx({ category: "work", note: "bucksbuddy.com subscription", amount_usd_cents: 1868, occurred_at: at(2026, 5, 9) }),
    ];
    const { payments } = detectRecurring(rows, "u1", NOW);
    // Two different domains, not one series sharing ".com".
    expect(payments.map((p) => [p.note, p.cadence, p.fromNote])).toEqual([
      ["sillyguy.com", "yearly", true],
      ["bucksbuddy.com", "yearly", true],
    ]);
  });

  it("rejects amounts that jump around, even on a steady schedule", () => {
    // Half the entries are odd ones out: that's not a payment.
    const rows = [5000, 9000, 5100, 9200].map((amount_usd_cents, i) =>
      tx({ category: "groceries", note: null, amount_usd_cents, occurred_at: at(2026, 2 + i, 1) }),
    );
    expect(detectRecurring(rows, "u1", NOW).payments).toHaveLength(0);
    // Within tolerance it's a series, priced at its latest amount.
    const steady = [
      tx({ category: "groceries", note: null, amount_usd_cents: 5000, occurred_at: at(2026, 5, 1) }),
      tx({ category: "groceries", note: null, amount_usd_cents: 5400, occurred_at: at(2026, 5, 8) }),
      tx({ category: "groceries", note: null, amount_usd_cents: 5200, occurred_at: at(2026, 5, 15) }),
    ];
    const p = detectRecurring(steady, "u1", NOW).payments[0];
    expect(p.cadence).toBe("weekly");
    expect(p.amountCents).toBe(5200);
    expect(p.monthlyCents).toBe(Math.round((5200 * 52) / 12));
  });

  it("flags a series whose next occurrence is already behind us", () => {
    const rows = monthly(3, {}, 3, 20); // Feb, Mar, Apr 20 — due May 20, now is Jun 10
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.overdue).toBe(true);
    expect(p.nextDueAt).toBe(at(2026, 4, 20));
  });

  it("stops showing a series once a whole period has passed beyond its due date", () => {
    // Monthly, last on Apr 1: due May 1, gone after Jun 1 (67 days) — by Jun 10 it's gone.
    expect(detectRecurring(monthly(3, {}, 3), "u1", NOW).payments).toHaveLength(0);
    // Weekly, last on May 22: due May 29, alive 16 days — gone on Jun 10 (19 days).
    const weekly = [0, 7, 14].map((d) =>
      tx({ category: "gym", note: null, amount_usd_cents: 2500, occurred_at: at(2026, 4, 8 + d) }),
    );
    expect(detectRecurring(weekly, "u1", NOW).payments).toHaveLength(0);
    // A hinted single entry lapses the same way.
    const old = [tx({ note: "Claude subscription", occurred_at: at(2026, 2, 1) })];
    expect(detectRecurring(old, "u1", NOW).payments).toHaveLength(0);
  });

  it("carries on after a skipped month, but starts over after a longer break", () => {
    // Jan, Feb, (nothing in Mar), Apr 1 — one skipped log, still one series.
    const skipped = [0, 1, 3, 4].map((m) => tx({ occurred_at: at(2026, m, 1) }));
    const p = detectRecurring(skipped, "u1", NOW).payments[0];
    expect(p.count).toBe(4);
    expect(p.firstAt).toBe(at(2026, 0, 1));

    // Ran Sep–Dec 2025, stopped, restarted May 1 2026: only the restart counts,
    // and one entry isn't enough on its own.
    const before = [8, 9, 10, 11].map((m) => tx({ occurred_at: at(2025, m, 1) }));
    expect(detectRecurring([...before, tx({ occurred_at: at(2026, 4, 1) })], "u1", NOW).payments)
      .toHaveLength(0);
    // With a second entry the restart is a series of its own, priced fresh.
    const restarted = [
      ...before,
      tx({ occurred_at: at(2026, 4, 1), amount_usd_cents: 2499 }),
      tx({ occurred_at: at(2026, 5, 1), amount_usd_cents: 2499 }),
    ];
    const r = detectRecurring(restarted, "u1", NOW).payments[0];
    expect(r.count).toBe(2);
    expect(r.firstAt).toBe(at(2026, 4, 1));
    expect(r.amountCents).toBe(2499);
    expect(r.previousAmountCents).toBeNull();
    expect(r.rows).toHaveLength(2);
  });

  it("compares notes without who they were 'with'", () => {
    // Three meals with the same person are three different things.
    const meals = [
      tx({ category: "food", note: "Dinner with Sara", amount_usd_cents: 4000, occurred_at: at(2026, 3, 1) }),
      tx({ category: "food", note: "Lunch with Sara", amount_usd_cents: 4000, occurred_at: at(2026, 4, 1) }),
      tx({ category: "food", note: "Brunch with Sara", amount_usd_cents: 4000, occurred_at: at(2026, 5, 1) }),
    ];
    expect(detectRecurring(meals, "u1", NOW).payments).toHaveLength(0);
    // The same thing with different people is still the same thing.
    const shared = [
      tx({ note: "Netflix with Ali", occurred_at: at(2026, 4, 1) }),
      tx({ note: "Netflix with Sara", occurred_at: at(2026, 5, 1) }),
    ];
    const p = detectRecurring(shared, "u1", NOW).payments[0];
    expect(p.count).toBe(2);
    expect(p.note).toBe("Netflix");
  });

  it("takes 'subscription' or 'membership' as recurring, monthly until the dates say otherwise", () => {
    const one = [tx({ note: "Claude subscription", amount_usd_cents: 20000, occurred_at: at(2026, 5, 6) })];
    const p = detectRecurring(one, "u1", NOW).payments[0];
    expect(p.cadence).toBe("monthly");
    expect(p.fromNote).toBe(false);
    expect(p.note).toBe("Claude"); // the word is a cue, not part of the name
    expect(p.count).toBe(1);

    // Written once, it keeps working for later entries that forget the word.
    const forgot = [
      tx({ note: "Claude subscription", amount_usd_cents: 20000, occurred_at: at(2026, 4, 6) }),
      tx({ note: "Claude", amount_usd_cents: 20000, occurred_at: at(2026, 5, 6) }),
    ];
    const f = detectRecurring(forgot, "u1", NOW).payments;
    expect(f).toHaveLength(1);
    expect(f[0].count).toBe(2);

    // Two logged a week apart: the dates decide.
    const weekly = [0, 7].map((d) =>
      tx({ category: "gym", note: "Gym membership", amount_usd_cents: 2500, occurred_at: at(2026, 4, 28 + d) }),
    );
    expect(detectRecurring(weekly, "u1", NOW).payments[0].cadence).toBe("weekly");

    // Irregular dates don't disqualify it — the note said so — and with no
    // cadence to read off them, monthly is assumed.
    const irregular = [1, 4, 9].map((d) =>
      tx({ note: "News subscription", amount_usd_cents: 500, occurred_at: at(2026, 5, d) }),
    );
    const n = detectRecurring(irregular, "u1", NOW).payments;
    expect(n).toHaveLength(1);
    expect(n[0].cadence).toBe("monthly");
  });

  it("sorts outgoings before income and nearest due first, and totals each side", () => {
    const rows = [
      ...monthly(3, { note: "Netflix" }, 5, 20), // due Jul 20
      ...monthly(3, { category: "rent", note: null, amount_usd_cents: 80000 }, 5, 1), // due Jul 1
      ...monthly(3, { is_income: true, category: "salary", note: null, amount_usd_cents: 300000 }, 5, 25),
      // Weekly income too, to exercise the per-month normalisation in the total.
      ...[0, 7, 14].map((d) =>
        tx({
          is_income: true,
          category: "freelance",
          note: "retainer",
          amount_usd_cents: 10000,
          occurred_at: at(2026, 4, 22 + d),
        }),
      ),
    ];
    const s = detectRecurring(rows, "u1", NOW);
    expect(s.payments.map((p) => `${p.isIncome ? "in" : "out"}:${p.category}`)).toEqual([
      "out:rent",
      "out:fees/subscriptions",
      "in:freelance",
      "in:salary",
    ]);
    expect(s.monthlyOutCents).toBe(80000 + 1599);
    expect(s.monthlyInCents).toBe(300000 + Math.round((10000 * 52) / 12));
  });

  it("recognises a yearly series from the dates alone", () => {
    const rows = [2025, 2026].map((y) =>
      tx({ category: "fees", note: "insurance", amount_usd_cents: 1200, occurred_at: at(y, 0, 15) }),
    );
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.cadence).toBe("yearly");
    expect(p.fromNote).toBe(false);
    expect(p.monthlyCents).toBe(100);
  });

  it("reports masked rows so the caller can refuse to show zeros", () => {
    const rows = monthly(3).map((r) => ({ ...r, amount_usd_cents: 0, amountMask: "a8" }));
    const s = detectRecurring(rows, "u1", NOW);
    expect(s.anyMasked).toBe(true);
  });

  it("defaults `now` to the current time", () => {
    const rows = monthly(3, {}, 3); // last on Apr 1 2026 — long gone by any real clock
    expect(detectRecurring(rows, "u1").payments).toHaveLength(0);
  });
});
