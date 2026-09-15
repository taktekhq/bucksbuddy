// The two reviews. Not windows a reader picks — products.
//
// There is no period picker any more. Choosing a window was a decision nobody
// could make well: you cannot know in advance which span writes a better review,
// and two of the three on offer were near-duplicates of each other. So there are
// two reviews, each answering a question someone actually has:
//
//   RECENT    "how is this month going" — the 3 months before this one against
//             this one, or as much of them as the account has. "At most three":
//             the window is clamped to the first entry, so a two-month-old
//             account gets a two-month review rather than a refusal.
//   ALL TIME  everything logged, anchored on the first entry.
//
// Both end NOW, so a review is a snapshot rather than a finished document, and
// both start at or after the account's first entry — which is why neither can
// fail the "does your history reach back far enough" gate. The only gate left is
// having enough logged to write about.
//
// The ids are the ones the database already allows (migration 0011), so changing
// the shape of the offer needed no new migration. `last_3_months` is the recent
// review; what it spans is what changed.

import { currentMonthRange, monthAnchor, monthLabel } from "@/lib/dates";

/** The two reviews on offer. */
export type ReportPeriodId = "last_3_months" | "all_time";

/**
 * Windows that were on offer before, kept only so a review already stored under
 * one still opens and still renders its own label. Nothing offers them now.
 */
export type LegacyReportPeriodId =
  | "last_month"
  | "past_3_months"
  | "this_vs_last";

export type ReportPeriod = {
  id: ReportPeriodId;
  /** The review's name. At most 70 characters, like every other string. */
  label: string;
  /** One line on what it reads. Also at most 70. */
  blurb: string;
};

export const REPORT_PERIODS: ReportPeriod[] = [
  {
    id: "last_3_months",
    label: "Recent months",
    blurb: "The 3 months before this one, against this one.",
  },
  {
    id: "all_time",
    label: "All time",
    blurb: "Everything you have ever logged.",
  },
];

/** How far back the recent review reaches, before clamping. */
export const RECENT_MONTHS = 3;

export const DEFAULT_REPORT_PERIOD: ReportPeriodId = "last_3_months";

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
    value === "past_3_months" ||
    value === "this_vs_last"
  );
}

/** The first of the month `RECENT_MONTHS` back — the recent review's reach. */
function recentReach(now: Date): Date {
  return currentMonthRange(monthAnchor(-RECENT_MONTHS, now)).from;
}

/**
 * Half-open [from, to) bounds, clamped so a window never starts before the
 * account did.
 *
 * `to` is always `now`: both reviews include the current month. `firstEntryAt`
 * comes from the eligibility answer — the only place that knows it — and is what
 * makes "at most three months" true for a young account. Without it the recent
 * review falls back to its full reach and all time to this month: both
 * under-report rather than inventing history, and the database clamps the real
 * window anyway (migration 0011).
 */
export function reportPeriodBounds(
  id: ReportPeriodId,
  now = new Date(),
  firstEntryAt: string | null = null,
): { from: Date; to: Date } {
  const first = firstEntryAt === null ? null : new Date(firstEntryAt);
  const anchor = first !== null && !Number.isNaN(first.getTime()) ? first : null;
  if (id === "all_time") {
    return { from: anchor ?? currentMonthRange(now).from, to: now };
  }
  const reach = recentReach(now);
  // The later of the two: three months back, or when the logging started.
  return { from: anchor !== null && anchor > reach ? anchor : reach, to: now };
}

/**
 * What `report_eligibility` should be asked about. Null means "from the first
 * entry" — only the database knows when that was, and for a window that is
 * anchored there rather than dated, it is the database that has to resolve it.
 * A date sent for the recent review is a ceiling: the function clamps it forward
 * to the first entry if the account is younger (migration 0011).
 */
export function eligibilityFrom(
  id: ReportPeriodId,
  now = new Date(),
): string | null {
  return id === "all_time" ? null : recentReach(now).toISOString();
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

/** The second line under a review's name: "July 2026 – September 2026". */
export function reportPeriodLabel(
  id: ReportPeriodId,
  now = new Date(),
  firstEntryAt: string | null = null,
): string {
  if (firstEntryAt === null && id === "all_time") {
    return "Everything you've logged";
  }
  const { from, to } = reportPeriodBounds(id, now, firstEntryAt);
  return reportWindowLabel(from, to);
}

/**
 * The name of a window, superseded ones included. Total over the ids this
 * version knows — check an id off a database row with `isKnownPeriodId` first.
 *
 * A stored review needs the name: both windows end at the moment they were asked
 * for, so their month spans can be identical. An all-time review taken by an
 * account that started in July and a recent review taken the same day cover the
 * same months, and the dates alone cannot tell them apart.
 */
export function periodName(id: ReportPeriodId | LegacyReportPeriodId): string {
  const offered = REPORT_PERIODS.find((p) => p.id === id);
  if (offered) return offered.label;
  if (id === "last_month") return "Last month";
  if (id === "this_vs_last") return "This month vs last";
  return "Past 3 finished months";
}

/**
 * The absolute label for a window a review was written for: "August 2026", or
 * "June 2026 – September 2026". `reportPeriodLabel` is relative to today and so
 * is only right for the offer; a stored review keeps its own name forever.
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
