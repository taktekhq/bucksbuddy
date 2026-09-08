// The date windows the export offers. Whole calendar months throughout: "last
// month" is all of August, not the trailing 30 days, so a month's export is the
// same document whenever in September you ask for it. The current, partial
// month is its own option rather than being folded into the others.

import { currentMonthRange, monthAnchor, monthLabel } from "@/lib/dates";
import type { Transaction } from "@/types/db";

export type ExportRangeId = "this_month" | "last_month" | "past_3_months" | "all_time";

export type ExportRange = {
  id: ExportRangeId;
  /** Row label in the picker. */
  label: string;
  /** Filename slug: bucksbuddy-last-month-2026-09-08.csv */
  slug: string;
};

export const EXPORT_RANGES: ExportRange[] = [
  { id: "this_month", label: "This month", slug: "this-month" },
  { id: "last_month", label: "Last month", slug: "last-month" },
  { id: "past_3_months", label: "Past 3 months", slug: "past-3-months" },
  { id: "all_time", label: "All time", slug: "all-time" },
];

export const DEFAULT_EXPORT_RANGE: ExportRangeId = "this_month";

/**
 * Half-open [from, to) bounds for a range, or nulls for "all time".
 *
 * `currentMonthRange` returns the calendar month *containing* the date it's
 * given, and `monthAnchor(-n)` lands on the last day of the month n back — so
 * the two compose into "the whole of the month n back" without new date math.
 */
export function exportRangeBounds(
  id: ExportRangeId,
  now = new Date(),
): { from: Date | null; to: Date | null } {
  if (id === "all_time") return { from: null, to: null };
  if (id === "this_month") return currentMonthRange(now);
  if (id === "last_month") return currentMonthRange(monthAnchor(-1, now));
  // Three whole months, ending with last month — September's partial month is
  // deliberately not part of "past 3 months".
  return {
    from: currentMonthRange(monthAnchor(-3, now)).from,
    to: currentMonthRange(monthAnchor(-1, now)).to,
  };
}

/** What the export covers, spelled out: "Last month · August 2026". */
export function exportRangeLabel(id: ExportRangeId, now = new Date()): string {
  const range = EXPORT_RANGES.find((r) => r.id === id)!;
  if (id === "all_time") return range.label;
  if (id === "past_3_months") {
    const first = monthLabel(monthAnchor(-3, now));
    const last = monthLabel(monthAnchor(-1, now));
    return `${range.label} · ${first} – ${last}`;
  }
  const anchor = id === "this_month" ? now : monthAnchor(-1, now);
  return `${range.label} · ${monthLabel(anchor)}`;
}

/** The rows that fall inside the range, newest-first order preserved. */
export function filterByExportRange(
  rows: Transaction[],
  id: ExportRangeId,
  now = new Date(),
): Transaction[] {
  const { from, to } = exportRangeBounds(id, now);
  if (!from || !to) return rows;
  const start = from.getTime();
  const end = to.getTime();
  return rows.filter((r) => {
    const at = new Date(r.occurred_at).getTime();
    return at >= start && at < end;
  });
}

/** "bucksbuddy-last-month-2026-09-08.pdf" */
export function exportFilename(
  id: ExportRangeId,
  extension: "csv" | "pdf",
  now = new Date(),
): string {
  const range = EXPORT_RANGES.find((r) => r.id === id)!;
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `bucksbuddy-${range.slug}-${stamp}.${extension}`;
}
