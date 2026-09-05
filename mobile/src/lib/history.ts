// Grouping for the full-history page. Two shapes:
//
//   • Timeline (default) — entries stay in reverse-chronological order, split
//     into day sections (each with its own net total), and only runs of
//     back-to-back entries in the same direction + category collapse into a
//     stack. This is the "did I log everything yesterday, and how much" view.
//   • By category — every entry of the same direction + category collapses into
//     one stack across all days, so a long history folds into a handful of
//     tappable stacks.
//
// Totals always go through `netCents` so signing stays consistent with the rest
// of the app (see lib/money.ts).

import { dayKey, dayLabel } from "@/lib/dates";
import { netCents } from "@/lib/money";
import type { Transaction } from "@/types/db";

export type HistoryGroup = {
  // `${is_income}:${category}` — direction and the full stored id (so +/- and
  // sub-categories like "food/restaurant" vs "food/delivery" never merge).
  key: string;
  category: string; // stored id, for icon/label/color lookups
  isIncome: boolean;
  rows: Transaction[]; // sorted occurred_at DESC
  count: number;
  totalCents: number; // signed, via netCents
  masked: boolean; // any row obscured (locked device) — can't be summed
  latestAt: string; // max occurred_at, for stack ordering
};

// Group transactions by direction + category. Stacks come back ordered by most
// recent activity first (matching the flat list's reverse-chronological feel),
// with each stack's rows sorted newest-first.
export function groupByCategory(rows: Transaction[]): HistoryGroup[] {
  const map = new Map<string, Transaction[]>();
  for (const r of rows) {
    const key = `${r.is_income}:${r.category}`;
    const bucket = map.get(key);
    if (bucket) bucket.push(r);
    else map.set(key, [r]);
  }

  const groups: HistoryGroup[] = [];
  for (const [key, bucket] of map) {
    // ISO timestamps are fixed-width, so lexical compare == chronological.
    const sorted = [...bucket].sort((a, b) =>
      b.occurred_at.localeCompare(a.occurred_at),
    );
    const first = sorted[0];
    groups.push({
      key,
      category: first.category,
      isIncome: first.is_income,
      rows: sorted,
      count: sorted.length,
      totalCents: netCents(sorted),
      masked: sorted.some((r) => r.amountMask != null),
      latestAt: first.occurred_at,
    });
  }

  groups.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  return groups;
}

export type TimelineDay = {
  key: string; // local day key, e.g. "2026-06-13" — also used as React key
  label: string; // "Today" / "Yesterday" / "Jun 12"
  totalCents: number; // signed net for the whole day, via netCents
  masked: boolean; // any row obscured (locked device) — total can't be shown
  // Runs in display order (newest-first). A run of one renders as a plain row;
  // two or more share a direction + category back-to-back and render as a stack.
  groups: HistoryGroup[];
};

// Build the timeline view: reverse-chronological, bucketed by local day, with
// consecutive same-direction/same-category entries collapsed into a run. Unlike
// `groupByCategory`, a category that recurs later in the day (after something
// else) starts a fresh run rather than merging — "immediately close together"
// is the whole point here.
export function groupByDay(rows: Transaction[], now = new Date()): TimelineDay[] {
  // ISO timestamps are fixed-width, so lexical compare == chronological.
  const sorted = [...rows].sort((a, b) =>
    b.occurred_at.localeCompare(a.occurred_at),
  );

  const days: TimelineDay[] = [];
  let day: TimelineDay | null = null;

  for (const r of sorted) {
    const dkey = dayKey(r.occurred_at);
    if (!day || day.key !== dkey) {
      day = {
        key: dkey,
        label: dayLabel(r.occurred_at, now),
        totalCents: 0,
        masked: false,
        groups: [],
      };
      days.push(day);
    }

    const runKey = `${r.is_income}:${r.category}`;
    const last = day.groups[day.groups.length - 1];
    if (last && last.key === runKey) {
      last.rows.push(r);
    } else {
      day.groups.push({
        key: runKey,
        category: r.category,
        isIncome: r.is_income,
        rows: [r],
        count: 0, // filled below, once the run is complete
        totalCents: 0,
        masked: false,
        latestAt: r.occurred_at, // run's first (newest) row
      });
    }
  }

  // Finalize per-run and per-day aggregates now that every run is complete.
  for (const d of days) {
    for (const g of d.groups) {
      g.count = g.rows.length;
      g.totalCents = netCents(g.rows);
      g.masked = g.rows.some((row) => row.amountMask != null);
    }
    d.totalCents = netCents(d.groups.flatMap((g) => g.rows));
    d.masked = d.groups.some((g) => g.masked);
  }

  return days;
}
