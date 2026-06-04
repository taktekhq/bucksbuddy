// Grouping for the full-history page. Entries are stacked by category
// (across any day) so a long history collapses into a handful of tappable
// stacks. Totals always go through `netCents` so signing stays consistent with
// the rest of the app (see lib/money.ts).

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
