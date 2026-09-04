// Month-boundary helpers. Single user — we group by the user's local month using
// the server's local time consistently between the home query and any aggregation.

export function currentMonthRange(now = new Date()): {
  from: Date;
  to: Date;
} {
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { from, to };
}

export function monthLabel(now = new Date()): string {
  return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * A date that anchors the month-scoped stats for `offset` months back from
 * `now` (0 = this month, -1 = last month, …). The current month anchors at
 * `now` so "elapsed days" reflect the partial month; past months anchor at
 * their last day (noon, to dodge DST/TZ edges) so the whole month counts as
 * elapsed and the forecast/pace math sees a finished month.
 */
export function monthAnchor(offset: number, now = new Date()): Date {
  if (offset === 0) return now;
  return new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 12, 0, 0, 0);
}

/** True when an ISO timestamp falls on the same LOCAL calendar day as `now`. */
export function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Stable local calendar-day key like "2026-06-13" — used to bucket the timeline
 * history by day. Local (not UTC) so a late-night entry lands on the day the
 * user actually made it.
 */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Human label for a day section: "Today" / "Yesterday" for the two most recent
 * days, otherwise "Jun 12" (or "Jun 12, 2025" when it's not the current year).
 */
export function dayLabel(iso: string, now = new Date()): string {
  if (isToday(iso, now)) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isToday(iso, yesterday)) return "Yesterday";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
