// Aggregations for the Stats page. Pure functions over the decrypted
// transactions, like lib/history.ts — anything money-valued is wrong while the
// device is locked (masked rows carry amount_usd_cents: 0), so callers must
// check `anyMasked` / the store's `locked` and fall back to counts, which stay
// truthful because direction and category are plaintext.

import { SAFE_CATEGORY_ID, splitCategory } from "@/lib/categories";
import { currentMonthRange } from "@/lib/dates";
import type { Transaction } from "@/types/db";

// How many rows the store fetches per table, newest first (see store.tsx).
// Exposed so the daily series can tell "no spending that day" apart from
// "older than what we fetched".
export const FETCH_CAP = 500;

/** Spending = money OUT that isn't an internal transfer to the Safe. */
export function isSpending(t: Transaction): boolean {
  return !t.is_income && splitCategory(t.category).base !== SAFE_CATEGORY_ID;
}

/** Local calendar-day key, "YYYY-MM-DD" (matches isToday's local-day rule). */
function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type DayPoint = {
  date: string; // local "YYYY-MM-DD"
  totalCents: number;
  count: number;
};

/**
 * Dense per-day spending series for the `days` days ending today, oldest
 * first, with quiet days zero-filled. When the fetch cap was hit, the window
 * is clamped to the oldest row we actually have — days before that are
 * unknown, not zero, and shouldn't be charted as flat.
 */
export function dailySpendSeries(
  rows: Transaction[],
  days: number,
  now = new Date(),
): DayPoint[] {
  let from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  if (rows.length >= FETCH_CAP) {
    // Rows arrive newest-first, but don't rely on it — find the oldest.
    let oldest = rows[0].occurred_at;
    for (const r of rows) if (r.occurred_at < oldest) oldest = r.occurred_at;
    const o = new Date(oldest);
    const oldestDay = new Date(o.getFullYear(), o.getMonth(), o.getDate());
    if (oldestDay > from) from = oldestDay;
  }

  const series: DayPoint[] = [];
  const byDay = new Map<string, DayPoint>();
  for (const d = from; d <= now; d.setDate(d.getDate() + 1)) {
    const point = { date: dayKey(d), totalCents: 0, count: 0 };
    byDay.set(point.date, point);
    series.push(point);
  }
  for (const r of rows) {
    if (!isSpending(r)) continue;
    const point = byDay.get(dayKey(new Date(r.occurred_at)));
    if (!point) continue; // outside the window
    point.totalCents += r.amount_usd_cents;
    point.count += 1;
  }
  return series;
}

/**
 * Centered moving average over ±radius neighbors. Sparse daily spending is a
 * comb of isolated spikes; where the series is decoration (the wash behind
 * the Home hero) this turns it into soft dunes. Don't use it where the chart
 * is the data.
 */
export function smoothSeries(values: number[], radius = 1): number[] {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - radius), i + radius + 1);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
}

export type CategoryStat = {
  category: string; // base id ("food", never "food/restaurant") for label/icon/color lookups
  totalCents: number;
  count: number;
  share: number; // of the month's spending total, 0..1 (0 when masked/zero)
};

/**
 * This month's spending grouped by base category (subcategories fold into
 * their parent), biggest first. Ties — and the locked case, where every
 * total is 0 — fall back to entry count, which is why `count` rides along.
 */
export function topCategories(
  rows: Transaction[],
  limit = 6,
  now = new Date(),
): CategoryStat[] {
  const { from, to } = currentMonthRange(now);
  const byCategory = new Map<string, CategoryStat>();
  let monthCents = 0;
  for (const r of rows) {
    const at = new Date(r.occurred_at);
    if (!isSpending(r) || at < from || at >= to) continue;
    const base = splitCategory(r.category).base;
    let stat = byCategory.get(base);
    if (!stat) {
      stat = { category: base, totalCents: 0, count: 0, share: 0 };
      byCategory.set(base, stat);
    }
    stat.totalCents += r.amount_usd_cents;
    stat.count += 1;
    monthCents += r.amount_usd_cents;
  }
  const sorted = [...byCategory.values()].sort(
    (a, b) => b.totalCents - a.totalCents || b.count - a.count,
  );
  for (const stat of sorted) {
    stat.share = stat.totalCents / Math.max(monthCents, 1);
  }
  return sorted.slice(0, limit);
}

/** One local day's spending activity, for the busiest-day pick. */
export type DayStat = { date: string; count: number; totalCents: number };

// "Treat yourself" categories: the want-not-need bases.
const TREAT_BASES = new Set(["fun", "shopping", "self_care"]);

export type MonthInsights = {
  spentCents: number;
  incomeCents: number;
  spendCount: number; // spending entries logged this month
  avgPerDayCents: number; // spentCents over the days elapsed so far
  forecastCents: number; // month-end projection at the current pace
  biggestExpense: Transaction | null;
  busiestDay: DayStat | null; // most spending entries
  noSpendDays: number; // elapsed days with nothing spent
  coffeeCount: number; // ☕ entries — the fun one
  treatCents: number; // fun + shopping + self care
  weekendShare: number; // 0..1 of spending entries landing on Sat/Sun
  anyMasked: boolean; // some row is obscured (locked device): money stats are lies
};

/** Fun-fact material for the current month. */
export function monthInsights(rows: Transaction[], now = new Date()): MonthInsights {
  const { from, to } = currentMonthRange(now);
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  let spentCents = 0;
  let incomeCents = 0;
  let spendCount = 0;
  let coffeeCount = 0;
  let treatCents = 0;
  let weekendCount = 0;
  let anyMasked = false;
  let biggestExpense: Transaction | null = null;
  const byDay = new Map<string, DayStat>();

  for (const r of rows) {
    const at = new Date(r.occurred_at);
    if (at < from || at >= to) continue;
    if (r.amountMask != null) anyMasked = true;
    const base = splitCategory(r.category).base;
    if (!isSpending(r)) {
      // Money IN — but pulling cash back out of the Safe isn't income.
      if (r.is_income && base !== SAFE_CATEGORY_ID) {
        incomeCents += r.amount_usd_cents;
      }
      continue;
    }
    spentCents += r.amount_usd_cents;
    spendCount += 1;
    if (base === "coffee") coffeeCount += 1;
    if (TREAT_BASES.has(base)) treatCents += r.amount_usd_cents;
    if (!biggestExpense || r.amount_usd_cents > biggestExpense.amount_usd_cents) {
      biggestExpense = r;
    }
    const day = dayKey(at);
    let stat = byDay.get(day);
    if (!stat) {
      stat = { date: day, count: 0, totalCents: 0 };
      byDay.set(day, stat);
    }
    stat.count += 1;
    stat.totalCents += r.amount_usd_cents;
    if (at.getDay() === 0 || at.getDay() === 6) weekendCount += 1;
  }

  let busiestDay: DayStat | null = null;
  for (const stat of byDay.values()) {
    if (!busiestDay || stat.count > busiestDay.count) busiestDay = stat;
  }

  return {
    spentCents,
    incomeCents,
    spendCount,
    avgPerDayCents: Math.round(spentCents / daysElapsed),
    forecastCents: Math.round((spentCents / daysElapsed) * daysInMonth),
    biggestExpense,
    busiestDay,
    // Future-dated entries later this month could outnumber elapsed days.
    noSpendDays: Math.max(daysElapsed - byDay.size, 0),
    coffeeCount,
    treatCents,
    weekendShare: weekendCount / Math.max(spendCount, 1),
    anyMasked,
  };
}
