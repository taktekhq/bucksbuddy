// The windows a paid spending review can cover.
//
// Whole calendar months only, and never the current partial one — the same rule
// the CSV/PDF export already follows (see lib/exportRange), so a review and an
// export of "last month" describe exactly the same rows. That also means a
// review is a finished document: asking for it again later in the month gives
// the same period rather than a moving target.
//
// The bounds come straight from `exportRangeBounds`, so there is no second copy
// of the month maths in the codebase.

import { exportRangeBounds, type ExportRangeId } from "@/lib/exportRange";
import { monthAnchor, monthLabel } from "@/lib/dates";

export type ReportPeriodId = "last_month" | "past_3_months";

export type ReportPeriod = {
  id: ReportPeriodId;
  /** Row label in the picker. */
  label: string;
  /** How many whole calendar months it spans. */
  months: number;
  /** The export range that defines its bounds. */
  range: ExportRangeId;
};

export const REPORT_PERIODS: ReportPeriod[] = [
  { id: "last_month", label: "Last month", months: 1, range: "last_month" },
  {
    id: "past_3_months",
    label: "Past 3 months",
    months: 3,
    range: "past_3_months",
  },
];

// Three months reads better than one and is what the owner asked to steer
// people towards, so it opens selected.
export const DEFAULT_REPORT_PERIOD: ReportPeriodId = "past_3_months";

function period(id: ReportPeriodId): ReportPeriod {
  return REPORT_PERIODS.find((p) => p.id === id)!;
}

export function isReportPeriodId(value: unknown): value is ReportPeriodId {
  return REPORT_PERIODS.some((p) => p.id === value);
}

/**
 * Half-open [from, to) bounds. Both periods end at the start of the current
 * month, so `to` is always in the past and the window is always complete.
 */
export function reportPeriodBounds(
  id: ReportPeriodId,
  now = new Date(),
): { from: Date; to: Date } {
  const { from, to } = exportRangeBounds(period(id).range, now);
  // Neither of our two ranges is "all time", so both bounds are real dates.
  return { from: from!, to: to! };
}

/** Whole days in the period — the denominator for logged-day coverage. */
export function reportPeriodDays(id: ReportPeriodId, now = new Date()): number {
  const { from, to } = reportPeriodBounds(id, now);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** What the review covers, spelled out: "Past 3 months · June 2026 – August 2026". */
export function reportPeriodLabel(id: ReportPeriodId, now = new Date()): string {
  const p = period(id);
  if (p.months === 1) return `${p.label} · ${monthLabel(monthAnchor(-1, now))}`;
  const first = monthLabel(monthAnchor(-p.months, now));
  const last = monthLabel(monthAnchor(-1, now));
  return `${p.label} · ${first} – ${last}`;
}

/**
 * The absolute label for a window that has already been bought: "August 2026",
 * or "June 2026 – August 2026". `reportPeriodLabel` is relative to today and so
 * is only right for the picker; a stored review keeps the same name forever.
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
