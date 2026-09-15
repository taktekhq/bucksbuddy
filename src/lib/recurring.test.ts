import { describe, it, expect } from "vitest";
import {
  MERGE_DAYS,
  MIN_OCCURRENCES,
  PRICE_CHANGE_TOLERANCE,
  SAME_PRICE_TOLERANCE,
  cadenceOf,
  detectRecurring,
  monthlyEquivalent,
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
    expect(priceTrack([1000, 1050, 980])).toEqual({ current: 980, previous: null });
    expect(priceTrack([1000])).toEqual({ current: 1000, previous: null });
  });

  it("accepts a price change once the old price has held for two entries", () => {
    expect(PRICE_CHANGE_TOLERANCE).toBe(0.5);
    expect(priceTrack([1599, 1599, 1999])).toEqual({ current: 1999, previous: 1599 });
    expect(priceTrack([1599, 1599, 1999, 1999, 2499])).toEqual({ current: 2499, previous: 1999 });
  });

  it("rejects a change that comes too soon, is too big, or keeps happening", () => {
    expect(priceTrack([1599, 1999])).toBeNull(); // old price never held
    expect(priceTrack([1000, 1000, 1600])).toBeNull(); // more than 50%
    expect(priceTrack([5000, 6000, 5200, 7000])).toBeNull(); // groceries, not a bill
  });
});

describe("detectRecurring", () => {
  it("finds a monthly subscription from two matching entries", () => {
    expect(MIN_OCCURRENCES).toBe(2);
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
    const rows = [tx({ category: "fees", note: "Domain (yearly)", amount_usd_cents: 1200, occurred_at: at(2026, 0, 15) })];
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.cadence).toBe("yearly");
    expect(p.fromNote).toBe(true);
    expect(p.note).toBe("Domain");
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

  it("rejects amounts that jump around, even on a steady schedule", () => {
    const rows = [
      tx({ category: "groceries", note: null, amount_usd_cents: 5000, occurred_at: at(2026, 5, 1) }),
      tx({ category: "groceries", note: null, amount_usd_cents: 9000, occurred_at: at(2026, 5, 8) }),
      tx({ category: "groceries", note: null, amount_usd_cents: 5200, occurred_at: at(2026, 5, 15) }),
    ];
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
    const rows = monthly(3, {}, 3); // Feb, Mar, Apr 1 — due May 1, now is Jun 10
    const p = detectRecurring(rows, "u1", NOW).payments[0];
    expect(p.overdue).toBe(true);
    expect(p.nextDueAt).toBe(at(2026, 4, 1));
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
          occurred_at: at(2026, 4, 1 + d),
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
      tx({ category: "fees", note: "domain", amount_usd_cents: 1200, occurred_at: at(y, 0, 15) }),
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
    const rows = monthly(3, {}, 3); // last on Apr 1 2026 — long overdue by any real clock
    expect(detectRecurring(rows, "u1").payments[0].overdue).toBe(true);
  });
});
