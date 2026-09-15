// The windows a spending review can cover.
//
// Two of the three end NOW rather than at the start of this month, so a review
// can answer "how is this month going" — the question a window that stops on the
// 1st cannot. That makes a review a snapshot rather than a finished document:
// asking again tomorrow covers a day more. The window each review was written
// for is stored on its own row, so a stored review still says what it read.
//
// "All time" has no fixed start. It is anchored on the account's first entry,
// which the eligibility answer already carries — so the window begins when the
// logging did, not at some floor date the account did not exist for.

import { currentMonthRange, monthAnchor, monthLabel } from "@/lib/dates";

/** The windows on offer. */
export type ReportPeriodId = "this_vs_last" | "last_3_months" | "all_time";

/**
 * Windows that were on offer before, kept only so a review already stored under
 * one still opens and still renders its own label. Nothing offers them now.
 */
export type LegacyReportPeriodId = "last_month" | "past_3_months";

export type ReportPeriod = {
  id: ReportPeriodId;
  /** Row label in the picker. At most 70 characters, like every other string. */
  label: string;
  /** Calendar months it touches, current one included. 0 = however many. */
  months: number;
};

export const REPORT_PERIODS: ReportPeriod[] = [
  { id: "this_vs_last", label: "This month vs last", months: 2 },
  { id: "last_3_months", label: "Past 3 months", months: 3 },
  { id: "all_time", label: "All time", months: 0 },
];

// The comparison is the one that answers a question someone actually has, so it
// opens selected.
export const DEFAULT_REPORT_PERIOD: ReportPeriodId = "this_vs_last";

export function isReportPeriodId(value: unknown): value is ReportPeriodId {
  return REPORT_PERIODS.some((p) => p.id === value);
}

/** Does this id name a window this app version can still read a review for? */
export function isKnownPeriodId(
  value: unknown,
): value is ReportPeriodId | LegacyReportPeriodId {
  return (
    isReportPeriodId(value) ||
    value === "last_month" ||
    value === "past_3_months"
  );
}

/**
 * Half-open [from, to) bounds.
 *
 * `to` is `now` for every window: two of them include the current month, and
 * for "all time" there is nothing else it could be. `firstEntryAt` is only read
 * for "all time" — pass the value from the eligibility answer. Without it the
 * window collapses to this month, which is the safest wrong answer: it under-
 * reports rather than inventing history.
 */
export function reportPeriodBounds(
  id: ReportPeriodId,
  now = new Date(),
  firstEntryAt: string | null = null,
): { from: Date; to: Date } {
  if (id === "all_time") {
    const first = firstEntryAt === null ? null : new Date(firstEntryAt);
    const from =
      first === null || Number.isNaN(first.getTime())
        ? currentMonthRange(now).from
        : first;
    return { from, to: now };
  }
  // -1 is last month, -2 the month before it: the window starts at the first of
  // that month and runs to this moment.
  const back = id === "this_vs_last" ? -1 : -2;
  return { from: currentMonthRange(monthAnchor(back, now)).from, to: now };
}

/**
 * What `report_eligibility` should be asked about. Null means "from the first
 * entry" — the database resolves it, because only it knows when that was (see
 * migration 0011).
 */
export function eligibilityFrom(
  id: ReportPeriodId,
  now = new Date(),
): string | null {
  if (id === "all_time") return null;
  return reportPeriodBounds(id, now).from.toISOString();
}

/** Whole days from the window's start to now — the coverage denominator. */
export function reportPeriodDays(
  id: ReportPeriodId,
  now = new Date(),
  firstEntryAt: string | null = null,
): number {
  const { from, to } = reportPeriodBounds(id, now, firstEntryAt);
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/** The picker's second line: "August – September 2026". Under 70 characters. */
export function reportPeriodLabel(
  id: ReportPeriodId,
  now = new Date(),
  firstEntryAt: string | null = null,
): string {
  if (id === "all_time") {
    if (firstEntryAt === null) return "Everything you've logged";
    const first = new Date(firstEntryAt);
    if (Number.isNaN(first.getTime())) return "Everything you've logged";
    return `Since ${monthLabel(first)}`;
  }
  const { from, to } = reportPeriodBounds(id, now);
  return reportWindowLabel(from, to);
}

/**
 * The name of a window, superseded ones included. Total over the ids this
 * version knows — check an id off a database row with `isKnownPeriodId` first.
 *
 * A stored review needs the name: two of the three windows end at the moment
 * they were asked for, so their month spans can be identical. An all-time review
 * bought by an account that started last month and a "this month vs last" bought
 * the same day span the same two months, and the dates alone cannot tell them
 * apart.
 */
export function periodName(id: ReportPeriodId | LegacyReportPeriodId): string {
  const offered = REPORT_PERIODS.find((p) => p.id === id);
  if (offered) return offered.label;
  return id === "last_month" ? "Last month" : "Past 3 finished months";
}

/**
 * The absolute label for a window a review was written for: "August 2026", or
 * "June 2026 – September 2026". `reportPeriodLabel` is relative to today and so
 * is only right for the picker; a stored review keeps its own name forever.
 */
export function reportWindowLabel(from: Date, to: Date): string {
  const first = monthLabel(from);
  // `to` is exclusive, so step back inside the window for its last month — by one
  // millisecond, which lands inside the final local day whatever its length.
  const last = monthLabel(new Date(to.getTime() - 1));
  return first === last ? first : `${first} – ${last}`;
}

/** A calendar date string ("2026-06-01") for a period bound, in local time. */
export function boundDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
