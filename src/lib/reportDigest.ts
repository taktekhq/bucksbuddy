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
import { formatCents, formatSignedCents } from "@/lib/money";
import { isSpending } from "@/lib/stats";
import {
  boundDate,
  reportWindowLabel,
  periodName,
  type LegacyReportPeriodId,
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

// First month against last, per category. Carries BOTH the totals and the daily
// rates, because the last month of a window that ends today is usually
// unfinished: its total is smaller for no other reason than that fewer days have
// happened. The rate is the comparable pair, so `changePct` and `direction` are
// computed from it, and each side's `days` travels with the figures so the
// review can say "over its first 15 days" instead of implying a full month.
export type DigestChange = {
  category: string;
  first: DigestMoney;
  last: DigestMoney;
  /** Days of each month inside the window — equal only if both are whole. */
  firstDays: number;
  lastDays: number;
  /** Spending per day, which is what the two are compared on. */
  firstPerDay: DigestMoney;
  lastPerDay: DigestMoney;
  /**
   * Change in the DAILY RATE, not in the totals — so the name says which, since
   * the model reads these keys. Null when the first month's rate is zero.
   */
  changePctPerDay: number | null;
  direction: "up" | "down" | "flat" | "new";
};

export type SpendingDigest = {
  version: 1;
  period: {
    id: ReportPeriodId | LegacyReportPeriodId;
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

/**
 * Every local calendar day the window touches, as "YYYY-MM-DD".
 *
 * Stepping starts at the MIDNIGHT of the window's first day, not at its first
 * instant. A window anchored on the account's first entry starts at whatever
 * time that was, and stepping in 24-hour hops from 09:30 would end a day early
 * — leaving the last sliver of the window in no day at all.
 */
/** "This month vs last · August 2026 – September 2026". */
function namedWindowLabel(
  id: ReportPeriodId | LegacyReportPeriodId,
  from: Date,
  to: Date,
): string {
  return `${periodName(id)} · ${reportWindowLabel(from, to)}`;
}

function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const first = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (const d = first; d < to; d.setDate(d.getDate() + 1)) {
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
// A review already stored under a superseded window still has to be readable,
// so the id is whatever its row carries — the digest only echoes it.
export type ReportWindow = {
  id: ReportPeriodId | LegacyReportPeriodId;
  from: Date;
  to: Date;
};

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
  // `net` is the one figure here that can be negative, and formatCents is
  // unsigned by design (it takes Math.abs) — so a month that spent more than it
  // logged coming in would hand the model "$711.00" for a deficit of $711, and
  // the review would read it back as a surplus. Nets get the signed formatter.
  const signedMoney = (cents: number): DigestMoney => ({
    cents,
    display: formatSignedCents(cents, homeCurrency),
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
  // The months come from the DAYS, not from a second walk over the calendar, so
  // the two can never disagree: every month here has at least one day inside the
  // window, and its `days` is how many — which is not the same as days in the
  // month. The current month is partial and an all-time window starts on the day
  // logging did; dividing a month's spending by its calendar length would halve
  // the daily average of a month half-elapsed and hand the model a figure that
  // reads as fact. (Walking the calendar instead also has a trap: stepping a
  // month from the 31st lands on March 3rd and skips February.)
  const windowDaysByMonth = new Map<string, number>();
  for (const day of days) {
    const key = day.slice(0, 7);
    windowDaysByMonth.set(key, (windowDaysByMonth.get(key) ?? 0) + 1);
  }
  for (const [key, monthDays] of windowDaysByMonth) {
    const [year, month] = key.split("-").map(Number);
    const d = new Date(year, month - 1, 1);
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
    month.net = signedMoney(month.income.cents - month.spent.cents);
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
  //
  // Compared on the DAILY RATE, never on the totals. The last month of a window
  // that ends today is part-way through, so its total is smaller by arithmetic
  // rather than by anything the reader did: on the 15th, spending at exactly
  // last month's rate would otherwise read as "down 50%" in every category — and
  // the model is told to copy these figures verbatim, so that would have been
  // handed to the reader as a fact.
  const monthOverMonth: DigestChange[] = [];
  if (months.length > 1) {
    const firstEntry = months[0];
    const lastEntry = months[months.length - 1];
    const firstMonth = monthSpendCents.get(firstEntry.key)!;
    const lastMonth = monthSpendCents.get(lastEntry.key)!;
    for (const id of new Set([...firstMonth.keys(), ...lastMonth.keys()])) {
      const first = firstMonth.get(id) ?? 0;
      const last = lastMonth.get(id) ?? 0;
      const firstPerDay = divide(first, firstEntry.days);
      const lastPerDay = divide(last, lastEntry.days);
      monthOverMonth.push({
        category: categoryLabel(id),
        first: money(first),
        last: money(last),
        firstDays: firstEntry.days,
        lastDays: lastEntry.days,
        firstPerDay: money(firstPerDay),
        lastPerDay: money(lastPerDay),
        changePctPerDay:
          firstPerDay === 0 ? null : pct(lastPerDay - firstPerDay, firstPerDay),
        direction:
          firstPerDay === 0
            ? "new"
            : lastPerDay === firstPerDay
              ? "flat"
              : lastPerDay > firstPerDay
                ? "up"
                : "down",
      });
    }
    monthOverMonth.sort((a, b) => b.last.cents - a.last.cents);
  }

  const expenseAmounts = spending.map((r) => r.amount_usd_cents);

  return {
    version: 1,
    period: {
      id: periodId,
      // Named as well as dated, because the model has to know whether it is
      // looking at a comparison, a quarter or an entire history — and because
      // two of the windows end today, so their dates alone do not say.
      label: namedWindowLabel(periodId, from, to),
      from: boundDate(from),
      // One millisecond back, not one day: the last local day of the window can
      // be 23 hours long across a spring-forward, and a fixed 24 hours would then
      // name the day before.
      to: boundDate(new Date(to.getTime() - 1)),
      days: days.length,
      months: months.length,
    },
    currency: { code: homeCurrency, symbol: currencyInfo(homeCurrency).symbol },
    totals: {
      spent: money(spentCents),
      income: money(incomeCents),
      net: signedMoney(incomeCents - spentCents),
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
