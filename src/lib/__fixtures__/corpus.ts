// A deterministic synthetic corpus for the golden-fixture (characterization)
// test — see golden.test.ts and docs/EXPO_MIGRATION.md, Validator #3.
//
// The point of a *generated* corpus rather than a handful of hand-picked rows
// is combinatorial coverage: every core stats/history function runs over the
// same few hundred transactions from several reference dates, so edges that
// no single hand-written test happens to probe (a run of coffee entries that
// isn't exactly half the month, a category that appears in both the income
// and expense lists, a transaction sitting on the exact millisecond a month
// begins) show up somewhere in the corpus without anyone having to think of
// them in advance.
//
// Generation is a seeded PRNG (mulberry32) with a fixed seed, so the corpus
// itself never changes between runs — determinism here is what makes the
// frozen golden.json meaningful. Nothing in this file uses Math.random,
// Date.now(), or any other non-deterministic source.

import type { NewSafeGoldEntry, SafeGoldEntry, Transaction } from "@/types/db";
import { DEFAULT_LBP_PER_USD, toUsdCents, type Currency } from "@/lib/currency";

// --- seeded PRNG -------------------------------------------------------
// mulberry32: small, fast, and good enough for fixture generation (not
// cryptographic — we just need the same sequence every time).
function mulberry32(seed: number) {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0xb0cc5;
const rng = mulberry32(SEED);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function int(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function chance(p: number): boolean {
  return rng() < p;
}

// --- category pool -------------------------------------------------------
// Real ids from lib/categories.ts, including several "parent/sub" pairings,
// two ids ("family", "other") that appear in BOTH the income and expense
// lists, the safe transfer category in both directions, and a few malformed
// / unknown ids that a real database could still contain (a category renamed
// or removed after the row was written).
const EXPENSE_CATEGORIES = [
  "groceries",
  "groceries/supermarket",
  "groceries/bakery",
  "food",
  "food/restaurant",
  "food/delivery",
  "coffee",
  "coffee/cafe",
  "gas",
  "parking",
  "transport",
  "transport/taxi",
  "transport/insurance",
  "shopping",
  "shopping/clothes",
  "shopping/electronics",
  "self_care",
  "self_care/spa",
  "self_care/hair",
  "gym",
  "health",
  "health/pharmacy",
  "health/insurance", // same sub id as transport/insurance — different parent
  "fees",
  "fees/mobile",
  "fees/subscriptions",
  "rent",
  "rent/airbnb",
  "fun",
  "fun/movies",
  "fun/drinks",
  "gifts",
  "gifts/birthday",
  "tips",
  "work",
  "family", // also top-level in INCOME_CATEGORIES
  "other", // also top-level in INCOME_CATEGORIES
] as const;

const INCOME_CATEGORIES = [
  "salary",
  "allowance",
  "freelance",
  "bonus",
  "gift",
  "family",
  "rent_income",
  "investment",
  "savings",
  "cashback",
  "refund",
  "other",
] as const;

// Categories that count as "treats" in monthInsights (fun, shopping, self_care
// bases) — kept in sync with stats.ts's TREAT_BASES so the corpus reliably
// exercises that path, without importing a private constant.
const TREAT_LEANING = [
  "fun",
  "fun/movies",
  "fun/drinks",
  "shopping",
  "shopping/clothes",
  "shopping/electronics",
  "self_care",
  "self_care/spa",
  "self_care/hair",
] as const;

// Unknown/malformed category strings a real row could still carry (renamed or
// removed category, multiple slashes, empty string).
const MALFORMED_CATEGORIES = [
  "deprecated_category",
  "misc/sub/extra",
  "",
] as const;

const LBP_RATES = [DEFAULT_LBP_PER_USD, 90_000, 85_000, 100_000, 15_000] as const;

const NOTES: readonly (string | null)[] = [
  null,
  null,
  null, // null is the common case — weight it heavily
  "",
  "lunch",
  "rent, June",
  'quoted "deal"',
  "line one\nline two",
  "café, deux-fois",
  "a".repeat(200), // long note
];

// --- month plan ------------------------------------------------------------
// 2026: ten "normal" months with ~30 entries each, April deliberately reduced
// to a single entry (the single-entry-month edge) and September left empty
// (the empty-month edge). July and November are pinned as calendar
// checkpoints — see REFERENCE_DATES below.
const MONTH_ENTRY_COUNTS: Record<number, number> = {
  0: 30, // Jan
  1: 30, // Feb (2026 is not a leap year — 28 days)
  2: 30, // Mar (contains the US DST spring-forward instant)
  3: 1, // Apr — single-entry month
  4: 30, // May
  5: 32, // Jun — slightly heavier, matches the existing hand-written fixtures
  6: 30, // Jul
  7: 30, // Aug
  8: 0, // Sep — empty month
  9: 30, // Oct
  10: 30, // Nov (contains the US DST fall-back instant)
  11: 30, // Dec
};

const YEAR = 2026;

function randomTimeOnDay(day: number, month: number): Date {
  const hour = int(0, 23);
  const minute = int(0, 59);
  const second = int(0, 59);
  const ms = int(0, 999);
  return new Date(YEAR, month, day, hour, minute, second, ms);
}

function daysInMonth(month: number): number {
  return new Date(YEAR, month + 1, 0).getDate();
}

export function generateTransactions(): Transaction[] {
  const rows: Transaction[] = [];
  let n = 0;

  const push = (
    occurred_at: Date,
    overrides: Partial<
      Pick<Transaction, "is_income" | "category" | "original_currency" | "note">
    > = {},
  ) => {
    n += 1;
    const is_income = overrides.is_income ?? chance(0.28);
    const category =
      overrides.category ??
      (is_income
        ? pick(INCOME_CATEGORIES)
        : chance(0.06)
          ? pick(MALFORMED_CATEGORIES)
          : chance(0.22)
            ? pick(TREAT_LEANING)
            : chance(0.1)
              ? "safe"
              : pick(EXPENSE_CATEGORIES));
    const original_currency: Currency = overrides.original_currency ?? (chance(0.4) ? "LBP" : "USD");
    const rate_used = pick(LBP_RATES);
    const original_amount =
      original_currency === "USD"
        ? Number((int(50, 50_000) / 100).toFixed(2)) // $0.50 – $500.00
        : int(5_000, 5_000_000); // LBP, whole units
    const amount_usd_cents = toUsdCents(original_amount, original_currency, rate_used);
    const note = overrides.note !== undefined ? overrides.note : pick(NOTES);

    rows.push({
      id: `tx-${String(n).padStart(4, "0")}`,
      user_id: "golden-user",
      is_income,
      category,
      amount_usd_cents,
      original_currency,
      original_amount,
      rate_used,
      occurred_at: occurred_at.toISOString(),
      note,
      created_at: occurred_at.toISOString(),
    });
  };

  for (const [monthStr, count] of Object.entries(MONTH_ENTRY_COUNTS)) {
    const month = Number(monthStr);
    for (let i = 0; i < count; i++) {
      const day = int(1, daysInMonth(month));
      if (month === 3) {
        // The single-entry month (April) is pinned as a spend, not left to
        // the PRNG — a single *income* entry would make monthInsights'
        // spend-per-day forecast divide zero by one and never exercise the
        // n=1 extrapolation this edge case exists to cover.
        push(randomTimeOnDay(day, month), { is_income: false, category: "groceries" });
      } else {
        push(randomTimeOnDay(day, month));
      }
    }
  }

  // --- deliberate boundary injections, on top of the random fill ----------
  // Exactly the month's first instant and exactly one millisecond before the
  // next month begins — the class of edge that fixture-at-noon tests never
  // probe (see the mutation-testing findings in stats.test.ts).
  push(new Date(YEAR, 0, 1, 0, 0, 0, 0), { category: "groceries" }); // Jan 1, 00:00:00.000
  push(new Date(YEAR, 5, 30, 23, 59, 59, 999), { category: "coffee" }); // Jun 30, 23:59:59.999
  push(new Date(YEAR, 6, 1, 0, 0, 0, 0), { category: "coffee" }); // Jul 1, 00:00:00.000

  // US DST spring-forward 2026 (Mar 8, 2:00am -> 3:00am): 2:30am doesn't exist
  // in local time, but the Date constructor normalizes it forward.
  push(new Date(YEAR, 2, 8, 2, 30, 0, 0), { category: "gas" });

  // US DST fall-back 2026 (Nov 1, 2:00am -> 1:00am): 1:30am occurs twice:
  // this pins whichever instant the local Date constructor resolves to.
  push(new Date(YEAR, 10, 1, 1, 30, 0, 0), { category: "parking" });

  // Both directions of a Safe transfer, so isSpending's category-based
  // exclusion is exercised in the corpus itself.
  push(randomTimeOnDay(15, 7), { is_income: false, category: "safe" }); // to the safe
  push(randomTimeOnDay(16, 7), { is_income: true, category: "safe" }); // back out

  // Field/category disagreement: nothing in the schema ties `is_income` to
  // whether the category "sounds like" income, so isSpending must read only
  // the field. These pin that it does.
  push(randomTimeOnDay(20, 7), { is_income: true, category: "groceries" });
  push(randomTimeOnDay(21, 7), { is_income: false, category: "salary" });

  // Boundary amounts: smallest possible (1 cent USD), a value that exercises
  // LBP round-half-to-even at the cent boundary, and a large one.
  push(randomTimeOnDay(3, 4), {
    category: "coffee",
    original_currency: "USD",
  });
  rows[rows.length - 1].original_amount = 0.01;
  rows[rows.length - 1].amount_usd_cents = 1;

  push(randomTimeOnDay(4, 4), { category: "shopping", original_currency: "LBP" });
  rows[rows.length - 1].rate_used = 89_500;
  rows[rows.length - 1].original_amount = 44_750; // exactly half a cent at the default rate
  rows[rows.length - 1].amount_usd_cents = toUsdCents(44_750, "LBP", 89_500);

  // Sort newest-first, matching how the store actually delivers rows (the
  // functions under test are documented as not relying on incoming order, but
  // pinning a realistic order means the golden output also exercises that).
  rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return rows;
}

export function generateGoldEntries(): SafeGoldEntry[] {
  const rows: SafeGoldEntry[] = [];
  const push = (occurred_at: Date, entry: NewSafeGoldEntry) => {
    rows.push({
      id: `gold-${String(rows.length + 1).padStart(3, "0")}`,
      user_id: "golden-user",
      is_deposit: entry.is_deposit,
      grams: entry.grams,
      note: entry.note ?? null,
      occurred_at: occurred_at.toISOString(),
      created_at: occurred_at.toISOString(),
    });
  };

  const grams = [5, 2.5, 0.125, 0.001, 100, 31.1034768, 0.0004];
  for (const [monthStr, count] of Object.entries(MONTH_ENTRY_COUNTS)) {
    const month = Number(monthStr);
    for (let i = 0; i < Math.min(count, 3); i++) {
      push(randomTimeOnDay(int(1, daysInMonth(month)), month), {
        is_deposit: chance(0.7),
        grams: pick(grams),
        note: chance(0.3) ? pick(NOTES) : null,
      });
    }
  }
  rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return rows;
}

// --- reference "now" dates --------------------------------------------------
// Named so a failure in golden.test.ts identifies which calendar edge broke,
// not just an array index.
export const REFERENCE_DATES: Record<string, Date> = {
  midMonth: new Date(YEAR, 5, 10, 15, 0, 0, 0), // Jun 10, mid-afternoon — the "normal" case
  yearStart: new Date(YEAR, 0, 1, 0, 0, 0, 0), // Jan 1, exactly midnight
  yearEnd: new Date(YEAR, 11, 31, 23, 59, 59, 999), // Dec 31, last millisecond
  febNonLeap: new Date(YEAR, 1, 15, 12, 0, 0, 0), // Feb 2026 — 28 days
  dstSpringForward: new Date(YEAR, 2, 8, 3, 0, 0, 0), // just after the US spring-forward instant
  dstFallBack: new Date(YEAR, 10, 1, 1, 30, 0, 0), // inside the repeated US fall-back hour
  emptyMonth: new Date(YEAR, 8, 15, 12, 0, 0, 0), // September — no transactions at all
  singleEntryMonth: new Date(YEAR, 3, 15, 12, 0, 0, 0), // April — exactly one transaction
};

// --- boundary values for direct (non-corpus) function calls -----------------
export const BOUNDARY_USD_AMOUNTS = [0, 0.01, 0.005, 0.004, 12.5, 999999.99, -5, NaN, Infinity];
export const BOUNDARY_LBP_AMOUNTS = [0, 1, 44_750, 89_500, 5_000_000, -100];
export const BOUNDARY_RATES = [0, -1, 1, 89_500, 1_000_000];
export const BOUNDARY_DISPLAY_STRINGS = ["", ".", "0", "0.", ".5", "12.50", "abc", "-1", "00012"];
export const BOUNDARY_CATEGORY_IDS = [
  "groceries",
  "groceries/supermarket",
  "family", // ambiguous: top-level in both lists
  "other", // ambiguous: top-level in both lists
  "safe",
  "unknown_category",
  "unknown/sub",
  "gas/no_such_sub", // real parent, fabricated sub
  "",
];
export const BOUNDARY_GRAMS = [0, 5, 2.5, 0.125, 0.0004, 1234.5678, -1];
