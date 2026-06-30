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
 * Dense per-day spending series for the whole calendar month containing
 * `anchor` (day 1 → last day), oldest first, quiet days zero-filled. The
 * 30-days-ending-today window (`dailySpendSeries`) charts the current month;
 * this one charts a past month you've paged back to on Stats.
 */
export function monthSpendSeries(rows: Transaction[], anchor = new Date()): DayPoint[] {
  const { from, to } = currentMonthRange(anchor);
  const last = new Date(to.getTime() - 1); // last day of the month

  const series: DayPoint[] = [];
  const byDay = new Map<string, DayPoint>();
  for (const d = new Date(from); d <= last; d.setDate(d.getDate() + 1)) {
    const point = { date: dayKey(d), totalCents: 0, count: 0 };
    byDay.set(point.date, point);
    series.push(point);
  }
  for (const r of rows) {
    if (!isSpending(r)) continue;
    const point = byDay.get(dayKey(new Date(r.occurred_at)));
    if (!point) continue; // outside this month
    point.totalCents += r.amount_usd_cents;
    point.count += 1;
  }
  return series;
}

export type MonthSpend = {
  monthKey: string; // "2026-06", the calendar month
  label: string; // "Jun" — short month name for the axis
  totalCents: number; // spending only (income + Safe transfers excluded)
  offset: number; // months back from `now` (0 = current), for paging
  isCurrent: boolean;
};

/**
 * Total spending per calendar month for the `months` months ending with the
 * one containing `now`, oldest first. Drives the cross-month trend bars on
 * Stats and the per-month average. Same `isSpending` rule as everywhere else,
 * so income and internal Safe transfers don't count.
 */
export function monthlySpendTotals(
  rows: Transaction[],
  months = 6,
  now = new Date(),
): MonthSpend[] {
  const series: MonthSpend[] = [];
  const byKey = new Map<string, MonthSpend>();
  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry: MonthSpend = {
      monthKey,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      totalCents: 0,
      offset: back > 0 ? -back : 0, // avoid -0 for the current month
      isCurrent: back === 0,
    };
    series.push(entry);
    byKey.set(monthKey, entry);
  }
  for (const r of rows) {
    if (!isSpending(r)) continue;
    const at = new Date(r.occurred_at);
    const monthKey = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
    const entry = byKey.get(monthKey);
    if (entry) entry.totalCents += r.amount_usd_cents;
  }
  return series;
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

// This month's spending rows passing `keep`, newest first — the receipts
// behind a tappable fun-fact chip.
function monthSpending(
  rows: Transaction[],
  now: Date,
  keep: (r: Transaction, at: Date) => boolean,
): Transaction[] {
  const { from, to } = currentMonthRange(now);
  return rows
    .filter((r) => {
      const at = new Date(r.occurred_at);
      return isSpending(r) && at >= from && at < to && keep(r, at);
    })
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/** The entries behind "Treat yourself", newest first. */
export function treatTransactions(rows: Transaction[], now = new Date()): Transaction[] {
  return monthSpending(rows, now, (r) =>
    TREAT_BASES.has(splitCategory(r.category).base),
  );
}

/** The entries behind "Weekend Spend" (Sat/Sun), newest first. */
export function weekendTransactions(rows: Transaction[], now = new Date()): Transaction[] {
  return monthSpending(rows, now, (_r, at) => at.getDay() === 0 || at.getDay() === 6);
}

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
  weekendCents: number; // spending money landing on Sat/Sun
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
  let weekendCents = 0;
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
    if (at.getDay() === 0 || at.getDay() === 6) weekendCents += r.amount_usd_cents;
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
    weekendCents,
    anyMasked,
  };
}
