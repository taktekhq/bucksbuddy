// Who may have a spending review, and how we explain a "no".
//
// The *rule* is enforced in the database (see the `report_eligibility` function
// in supabase/migrations/0009_spending_reviews.sql) for two reasons: it counts
// every row the account has, not the newest FETCH_CAP the store happens to hold,
// and the review-start function has to be able to refuse a review without
// trusting the browser. This module is the other half: the types of what the
// database returns, and the copy that turns those counts into something a
// person can act on.
//
// Eligibility only ever needs COUNTS and DATES — which is lucky, because the
// amounts are encrypted per-column and the server genuinely cannot read them.

import type { ReportPeriodId } from "@/lib/reportPeriod";

// Mirrors `min_spend_entries` in the migration. The database echoes its own
// threshold back in every answer, so the copy below quotes the server rather
// than this constant; it's the fallback for a deployment where the migration
// hasn't been applied yet.
export const MIN_SPEND_ENTRIES = 40;

/** Coverage under this reads as "a lot of unlogged days" — a warning, not a no. */
export const LOW_COVERAGE = 0.5;

/** A hole this long in the middle of the period is worth flagging. */
export const LONG_GAP_DAYS = 7;

/** What `report_eligibility` returns. Counts and dates only. */
export type ReportFacts = {
  periodFrom: string;
  periodTo: string;
  periodDays: number;
  /** Spending entries in the window: money out, excluding Safe transfers. */
  spendCount: number;
  /** Every entry in the window, income included. */
  entryCount: number;
  /** Distinct calendar days in the window carrying at least one entry. */
  loggedDays: number;
  /** Longest run of consecutive days in the window with nothing logged. */
  longestGapDays: number;
  /** The account's very first entry, or null for an empty account. */
  firstEntryAt: string | null;
  /** True when logging started on or before the first day of the window. */
  coversPeriod: boolean;
  /** The threshold the server actually applied. */
  minSpendEntries: number;
  /** The server's verdict. This module never overrides it. */
  ok: boolean;
};

export type EligibilityCopy = {
  ok: boolean;
  /** Why they can't buy yet. Empty when `ok`. */
  blockers: string[];
  /** Why the review may be thin. Shown either way; never blocks. */
  warnings: string[];
};

/** Logged days over days in the period, 0..1. */
export function coverageRatio(facts: ReportFacts): number {
  return facts.periodDays === 0 ? 0 : facts.loggedDays / facts.periodDays;
}

/**
 * One hard gate — at least 40 logged expenses — and one soft one ("ideally not
 * many unlogged days"), which is deliberately a warning: a thin month is still
 * the customer's call, and the review says so in its own text rather than being
 * refused at the door.
 *
 * The old second gate is gone, because neither review can fail it. Both windows
 * start at or after the account's first entry (the recent one is clamped forward
 * to it — see migration 0011), so "does your history reach back far enough" is
 * now true by construction. What is left is the empty account, which fails on
 * having nothing to read.
 *
 * Every sentence here is at most 70 characters. The counters above them already
 * show the numbers, so the words only have to name what is missing.
 */
export function describeEligibility(
  facts: ReportFacts,
  periodId: ReportPeriodId,
): EligibilityCopy {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const threshold = facts.minSpendEntries;

  if (facts.spendCount < threshold) {
    // The count in the sentence is what is LEFT, so that is what the noun has to
    // agree with: one more expense, not one more expenses.
    const left = threshold - facts.spendCount;
    blockers.push(`${left} more ${left === 1 ? "expense" : "expenses"} to go.`);
  }
  if (facts.firstEntryAt === null) blockers.push("Nothing logged yet.");

  const coverage = coverageRatio(facts);
  // Not for all time, where the denominator is the account's whole life: someone
  // who logged diligently for four months but opened two years ago sits near
  // 17%, and warning them about it on the review whose point is the long view
  // would be noise. The counters still show the real ratio.
  if (periodId !== "all_time" && facts.loggedDays > 0 && coverage < LOW_COVERAGE) {
    // Phrased from the unlogged side: this only fires under half coverage, so the
    // count is always plural and the sentence needs no singular form.
    warnings.push(
      `${facts.periodDays - facts.loggedDays} of ${facts.periodDays} days have nothing logged.`,
    );
  }
  if (facts.longestGapDays > LONG_GAP_DAYS) {
    // Likewise: only fires above LONG_GAP_DAYS, so never "1 days".
    warnings.push(`${facts.longestGapDays} days in a row are empty.`);
  }

  return { ok: facts.ok && blockers.length === 0, blockers, warnings };
}
