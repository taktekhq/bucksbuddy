// The deterministic digest a spending review is written from.
//
// The arithmetic happens HERE, on the device, over decrypted rows — never in the
// language model. The model receives this object and writes prose about it; it is
// told to quote the `display` strings verbatim and never to compute anything. So
// a review can be wrong about tone or emphasis, but it cannot be wrong about a
// number: every figure it can print was totalled by the same functions that draw
// the Stats screen.
//
// Two deliberate omissions:
//   * NOTES NEVER LEAVE THE DEVICE. Free-text notes routinely name people,
//     merchants and reasons, and none of that is needed to describe a spending
//     pattern. The digest carries categories, dates and amounts only.
//   * NO TIME-OF-DAY. `occurred_at` is stamped when an entry is *logged* (the
//     composer has no date picker), so an hour-of-day histogram would describe
//     phone habits while sounding like it described spending. Weekday fields are
//     named for logging for the same reason.

import { dayKey } from "@/lib/dates";
import { categoryLabel, categorySubLabel, splitCategory } from "@/lib/categories";
import { currencyInfo, type Currency } from "@/lib/currency";
import { formatCents } from "@/lib/money";
import { isSpending } from "@/lib/stats";
import {
  boundDate,
  reportWindowLabel,
  type ReportPeriodId,
} from "@/lib/reportPeriod";
import type { Transaction } from "@/types/db";

/** Every amount travels as both an integer and the string the app would show. */
export type DigestMoney = { cents: number; display: string };

export type DigestMonth = {
  key: string;
  label: string;
  spent: DigestMoney;
  income: DigestMoney;
  net: DigestMoney;
  spendCount: number;
  daysLogged: number;
  days: number;
  dailyAverage: DigestMoney;
};

export type DigestCategory = {
  label: string;
  spent: DigestMoney;
  count: number;
  sharePct: number;
  averageEntry: DigestMoney;
};

export type DigestWeekday = {
  label: string;
  spent: DigestMoney;
  count: number;
  sharePct: number;
};

export type DigestEntry = {
  date: string;
  category: string;
  amount: DigestMoney;
};

export type DigestRepeat = {
  category: string;
  amount: DigestMoney;
  count: number;
  medianGapDays: number;
};

export type DigestChange = {
  category: string;
  first: DigestMoney;
  last: DigestMoney;
  changePct: number | null;
  direction: "up" | "down" | "flat" | "new";
};

export type SpendingDigest = {
  version: 1;
  period: {
    id: ReportPeriodId;
    label: string;
    from: string;
    to: string;
    days: number;
    months: number;
  };
  currency: { code: string; symbol: string };
  totals: {
    spent: DigestMoney;
    income: DigestMoney;
    net: DigestMoney;
    spendCount: number;
    entryCount: number;
    dailyAverage: DigestMoney;
    perLoggedDayAverage: DigestMoney;
    medianExpense: DigestMoney;
    averageExpense: DigestMoney;
  };
  coverage: {
    days: number;
    daysLogged: number;
    daysWithNothingLogged: number;
    daysWithNoSpending: number;
    coveragePct: number;
    longestGapDays: number;
    busiestDay: { date: string; count: number; spent: DigestMoney } | null;
  };
  months: DigestMonth[];
  categories: DigestCategory[];
  subcategories: DigestCategory[];
  weekdaysLogged: DigestWeekday[];
  weekendSharePct: number;
  largestExpenses: DigestEntry[];
  repeatedCharges: DigestRepeat[];
  monthOverMonth: DigestChange[];
};

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** How many of the biggest single expenses to name. */
const TOP_EXPENSES = 5;
/** How many categories and subcategories to carry. */
const TOP_CATEGORIES = 10;
/** A charge has to land this many times to count as repeating. */
const MIN_REPEATS = 3;

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function divide(total: number, by: number): number {
  return by === 0 ? 0 : Math.round(total / by);
}

/** Every local calendar day in [from, to), as "YYYY-MM-DD". */
function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (const d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
    out.push(boundDate(d));
  }
  return out;
}

/** The longest run of consecutive days in `days` that `has` rejects. */
function longestRunWithout(days: string[], has: (day: string) => boolean): number {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = has(day) ? 0 : run + 1;
    if (run > longest) longest = run;
  }
  return longest;
}

/**
 * The window a digest covers. Passed in rather than derived from today's date:
 * a review bought on the last day of a month and opened the next morning must
 * describe the months it was sold for, not the ones that are now "last".
 */
export type ReportWindow = { id: ReportPeriodId; from: Date; to: Date };

export function buildDigest(
  rows: Transaction[],
  window: ReportWindow,
  homeCurrency: Currency,
): SpendingDigest {
  const { id: periodId, from, to } = window;
  const money = (cents: number): DigestMoney => ({
    cents,
    display: formatCents(cents, homeCurrency),
  });

  const start = from.getTime();
  const end = to.getTime();
  const inPeriod = rows.filter((r) => {
    const at = new Date(r.occurred_at).getTime();
    return at >= start && at < end;
  });
  const spending = inPeriod.filter(isSpending);

  // --- totals ---
  let spentCents = 0;
  let incomeCents = 0;
  for (const r of inPeriod) {
    if (isSpending(r)) spentCents += r.amount_usd_cents;
    // Cash coming back out of the Safe is a transfer, not income — the same
    // rule lib/stats applies to the Stats page.
    else if (r.is_income && splitCategory(r.category).base !== "safe") {
      incomeCents += r.amount_usd_cents;
    }
  }

  const days = daysBetween(from, to);
  const loggedDays = new Set(inPeriod.map((r) => dayKey(r.occurred_at)));
  const spendingByDay = new Map<string, { count: number; cents: number }>();
  for (const r of spending) {
    const key = dayKey(r.occurred_at);
    const day = spendingByDay.get(key) ?? { count: 0, cents: 0 };
    day.count += 1;
    day.cents += r.amount_usd_cents;
    spendingByDay.set(key, day);
  }

  let busiest: SpendingDigest["coverage"]["busiestDay"] = null;
  for (const [date, day] of spendingByDay) {
    if (!busiest || day.count > busiest.count) {
      busiest = { date, count: day.count, spent: money(day.cents) };
    }
  }

  // --- per calendar month ---
  const months: DigestMonth[] = [];
  const monthIndex = new Map<string, DigestMonth>();
  const monthSpendCents = new Map<string, Map<string, number>>();
  for (const d = new Date(from); d < to; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const entry: DigestMonth = {
      key,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      spent: money(0),
      income: money(0),
      net: money(0),
      spendCount: 0,
      daysLogged: 0,
      days: monthDays,
      dailyAverage: money(0),
    };
    months.push(entry);
    monthIndex.set(key, entry);
    monthSpendCents.set(key, new Map());
  }

  const monthKeyOf = (iso: string) => dayKey(iso).slice(0, 7);
  const monthLoggedDays = new Map<string, Set<string>>();
  for (const r of inPeriod) {
    const key = monthKeyOf(r.occurred_at);
    const month = monthIndex.get(key);
    // A row can only be outside the month set if it were outside the period,
    // which the filter above already ruled out.
    const logged = monthLoggedDays.get(key) ?? new Set<string>();
    logged.add(dayKey(r.occurred_at));
    monthLoggedDays.set(key, logged);
    if (isSpending(r)) {
      month!.spent.cents += r.amount_usd_cents;
      month!.spendCount += 1;
      const base = splitCategory(r.category).base;
      const perCategory = monthSpendCents.get(key)!;
      perCategory.set(base, (perCategory.get(base) ?? 0) + r.amount_usd_cents);
    } else if (r.is_income && splitCategory(r.category).base !== "safe") {
      month!.income.cents += r.amount_usd_cents;
    }
  }
  for (const month of months) {
    month.spent = money(month.spent.cents);
    month.income = money(month.income.cents);
    month.net = money(month.income.cents - month.spent.cents);
    month.daysLogged = monthLoggedDays.get(month.key)?.size ?? 0;
    month.dailyAverage = money(divide(month.spent.cents, month.days));
  }

  // --- categories and subcategories ---
  const byCategory = new Map<string, { cents: number; count: number }>();
  const bySubcategory = new Map<string, { cents: number; count: number }>();
  const byWeekday = new Map<number, { cents: number; count: number }>();
  let weekendCents = 0;
  for (const r of spending) {
    const { base } = splitCategory(r.category);
    const cat = byCategory.get(base) ?? { cents: 0, count: 0 };
    cat.cents += r.amount_usd_cents;
    cat.count += 1;
    byCategory.set(base, cat);

    const sub = categorySubLabel(r.category);
    if (sub !== null) {
      const label = `${categoryLabel(base)} · ${sub}`;
      const stat = bySubcategory.get(label) ?? { cents: 0, count: 0 };
      stat.cents += r.amount_usd_cents;
      stat.count += 1;
      bySubcategory.set(label, stat);
    }

    const weekday = new Date(r.occurred_at).getDay();
    const wd = byWeekday.get(weekday) ?? { cents: 0, count: 0 };
    wd.cents += r.amount_usd_cents;
    wd.count += 1;
    byWeekday.set(weekday, wd);
    if (weekday === 0 || weekday === 6) weekendCents += r.amount_usd_cents;
  }

  const toStats = (
    entries: [string, { cents: number; count: number }][],
  ): DigestCategory[] =>
    entries
      .sort((a, b) => b[1].cents - a[1].cents || b[1].count - a[1].count)
      .slice(0, TOP_CATEGORIES)
      .map(([label, stat]) => ({
        label,
        spent: money(stat.cents),
        count: stat.count,
        sharePct: pct(stat.cents, spentCents),
        averageEntry: money(divide(stat.cents, stat.count)),
      }));

  const categories = toStats(
    [...byCategory].map(([id, stat]) => [categoryLabel(id), stat]),
  );
  const subcategories = toStats([...bySubcategory]);

  const weekdaysLogged: DigestWeekday[] = WEEKDAY_LABELS.map((label, index) => {
    const stat = byWeekday.get(index) ?? { cents: 0, count: 0 };
    return {
      label,
      spent: money(stat.cents),
      count: stat.count,
      sharePct: pct(stat.cents, spentCents),
    };
  });

  // --- the biggest single expenses ---
  const largestExpenses: DigestEntry[] = [...spending]
    .sort((a, b) => b.amount_usd_cents - a.amount_usd_cents)
    .slice(0, TOP_EXPENSES)
    .map((r) => ({
      date: dayKey(r.occurred_at),
      category: categoryLabel(splitCategory(r.category).base),
      amount: money(r.amount_usd_cents),
    }));

  // --- charges that repeat at the same amount ---
  const repeatGroups = new Map<string, { base: string; cents: number; days: string[] }>();
  for (const r of spending) {
    const base = splitCategory(r.category).base;
    const key = `${base}:${r.amount_usd_cents}`;
    const group =
      repeatGroups.get(key) ?? { base, cents: r.amount_usd_cents, days: [] };
    group.days.push(dayKey(r.occurred_at));
    repeatGroups.set(key, group);
  }
  const repeatedCharges: DigestRepeat[] = [...repeatGroups.values()]
    .filter((g) => g.days.length >= MIN_REPEATS)
    .map((g) => {
      const sorted = [...g.days].sort();
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(
          Math.round(
            (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) /
              86_400_000,
          ),
        );
      }
      return {
        category: categoryLabel(g.base),
        amount: money(g.cents),
        count: g.days.length,
        medianGapDays: median(gaps),
      };
    })
    .sort((a, b) => b.count - a.count || b.amount.cents - a.amount.cents)
    .slice(0, TOP_CATEGORIES);

  // --- first month against last, per category (only with 2+ months) ---
  const monthOverMonth: DigestChange[] = [];
  if (months.length > 1) {
    const firstMonth = monthSpendCents.get(months[0].key)!;
    const lastMonth = monthSpendCents.get(months[months.length - 1].key)!;
    for (const id of new Set([...firstMonth.keys(), ...lastMonth.keys()])) {
      const first = firstMonth.get(id) ?? 0;
      const last = lastMonth.get(id) ?? 0;
      monthOverMonth.push({
        category: categoryLabel(id),
        first: money(first),
        last: money(last),
        changePct: first === 0 ? null : pct(last - first, first),
        direction:
          first === 0 ? "new" : last === first ? "flat" : last > first ? "up" : "down",
      });
    }
    monthOverMonth.sort((a, b) => b.last.cents - a.last.cents);
  }

  const expenseAmounts = spending.map((r) => r.amount_usd_cents);

  return {
    version: 1,
    period: {
      id: periodId,
      label: reportWindowLabel(from, to),
      from: boundDate(from),
      to: boundDate(new Date(to.getTime() - 86_400_000)),
      days: days.length,
      months: months.length,
    },
    currency: { code: homeCurrency, symbol: currencyInfo(homeCurrency).symbol },
    totals: {
      spent: money(spentCents),
      income: money(incomeCents),
      net: money(incomeCents - spentCents),
      spendCount: spending.length,
      entryCount: inPeriod.length,
      dailyAverage: money(divide(spentCents, days.length)),
      perLoggedDayAverage: money(divide(spentCents, loggedDays.size)),
      medianExpense: money(median(expenseAmounts)),
      averageExpense: money(divide(spentCents, spending.length)),
    },
    coverage: {
      days: days.length,
      daysLogged: loggedDays.size,
      daysWithNothingLogged: days.length - loggedDays.size,
      daysWithNoSpending: days.length - spendingByDay.size,
      coveragePct: pct(loggedDays.size, days.length),
      longestGapDays: longestRunWithout(days, (d) => loggedDays.has(d)),
      busiestDay: busiest,
    },
    months,
    categories,
    subcategories,
    weekdaysLogged,
    weekendSharePct: pct(weekendCents, spentCents),
    largestExpenses,
    repeatedCharges,
    monthOverMonth,
  };
}
