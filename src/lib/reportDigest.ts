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
import {
  categoryLabel,
  categorySubLabel,
  SAFE_CATEGORY_ID,
  splitCategory,
} from "@/lib/categories";
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
  /**
   * The stored category id — for a subcategory, its PARENT's id. The screen
   * draws each row with the category's own icon and colour (lib/categories),
   * and the label alone cannot be looked up: labels are display strings and a
   * subcategory's is composed of two of them.
   */
  id: string;
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

// The first WHOLE calendar month in the window against the last whole one, per
// category.
//
// "Whole" is the whole point. A window that ends today ends part-way through its
// last month, and comparing that stub to a finished month is the single easiest
// way to hand the reader a false fact. Normalising to a daily rate does not save
// it either — worse, it invents movement where there is none: rent logged once a
// month is $600 in a thirty-day month and $600 in a sixteen-day one, which reads
// as "$20.00 a day rising to $37.50 a day, up 87.5%" when nothing changed at
// all. A per-day rate only means something for spending that is actually spread
// across the days.
//
// So partial months are excluded from this comparison entirely, and the two ends
// name themselves rather than being inferred from the window: with fewer than
// two whole months there is nothing here to compare and the list is empty.
export type DigestChange = {
  category: string;
  first: DigestMoney;
  last: DigestMoney;
  /** Which two months these are — not necessarily the window's own ends. */
  firstMonth: string;
  lastMonth: string;
  /** Days in each. Both are whole calendar months, so 28 to 31. */
  firstDays: number;
  lastDays: number;
  /** Change in the month's TOTAL, which is the comparable pair once both months
   * are whole. Null when the first month spent nothing on this category. */
  changePct: number | null;
  direction: "up" | "down" | "flat" | "new";
};

/**
 * What the window did with what was left over.
 *
 * The Safe is this app's savings jar, and a move into it is a TRANSFER, not
 * spending — `isSpending` excludes it, and so does income, which is why none of
 * the totals see it. But "am I saving" is half of what a review is asked to
 * answer, so the transfers are totalled here on their own terms: `intoSafe` is
 * money put away, `outOfSafe` money taken back out, and `netIntoSafe` the
 * difference, which can be negative in a window that raided it.
 *
 * `leftOverSharePct` is income minus spending as a share of income — what the
 * window did not spend. `savedSharePct` is the part of income that actually
 * reached the Safe. They differ, and the gap is the point: money can go unspent
 * without being put anywhere.
 */
export type DigestSaving = {
  intoSafe: DigestMoney;
  outOfSafe: DigestMoney;
  /** Signed: negative in a window that took more out than it put in. */
  netIntoSafe: DigestMoney;
  /**
   * Net into the Safe as a share of income — NULL when no income was logged in
   * the window, rather than zero. Zero would read as "saved none of what came
   * in", which is a claim about a denominator that does not exist.
   */
  savedSharePct: number | null;
  /**
   * Income minus spending over income, also null without income. Negative when
   * spending exceeded what came in.
   */
  leftOverSharePct: number | null;
};

export type SpendingDigest = {
  /**
   * 2 — the digest carries `saving`, and the review it asks for is a set of
   * auditor's findings rather than prose. The generating function checks this
   * and refuses anything else, so a stale deploy says so instead of quietly
   * writing the old shape.
   */
  version: 2;
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
  saving: DigestSaving;
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

/** A share that refuses to exist without a denominator. See DigestSaving. */
function share(part: number, whole: number): number | null {
  return whole === 0 ? null : pct(part, whole);
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

/** Days in the calendar month a "YYYY-MM" key names. */
export function daysInCalendarMonth(key: string): number {
  const [year, month] = key.split("-").map(Number);
  // Day 0 of the NEXT month is the last day of this one.
  return new Date(year, month, 0).getDate();
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

/**
 * Spending per local calendar day across the window, oldest first, quiet days
 * zero-filled.
 *
 * NOT part of the digest, and deliberately so: this is for the charts the device
 * draws, and an all-time window is thousands of days — sending that to a model
 * that is told to quote figures verbatim would be a payload of numbers it has no
 * use for and could misread. It lives here rather than in lib/stats so it obeys
 * the same window and local-day rules as everything else a review is built from
 * (lib/stats clamps its window to a 500-row fetch cap, which is exactly what a
 * review must not do).
 */
export function daySpendSeries(
  rows: Transaction[],
  window: ReportWindow,
): { date: string; cents: number }[] {
  const start = window.from.getTime();
  const end = window.to.getTime();
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const at = new Date(r.occurred_at).getTime();
    if (at < start || at >= end || !isSpending(r)) continue;
    const key = dayKey(r.occurred_at);
    byDay.set(key, (byDay.get(key) ?? 0) + r.amount_usd_cents);
  }
  return daysBetween(window.from, window.to).map((date) => ({
    date,
    cents: byDay.get(date) ?? 0,
  }));
}

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
  // The two halves of the savings jar, kept out of both totals above on
  // purpose: putting money in the Safe is not spending it, and taking it back
  // out is not earning it. See DigestSaving.
  let intoSafeCents = 0;
  let outOfSafeCents = 0;
  for (const r of inPeriod) {
    const safe = splitCategory(r.category).base === SAFE_CATEGORY_ID;
    if (safe) {
      if (r.is_income) outOfSafeCents += r.amount_usd_cents;
      else intoSafeCents += r.amount_usd_cents;
      continue;
    }
    // What is left is either direction, minus the Safe — which the branch above
    // has already taken out and skipped. So money out is spending and money in
    // is income, with no second test needed for the transfer case: lib/stats
    // applies exactly this rule to the Stats page.
    if (isSpending(r)) spentCents += r.amount_usd_cents;
    else incomeCents += r.amount_usd_cents;
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
  // Keyed by the composed display label, but carrying the parent id: a
  // subcategory inherits its parent's icon and colour, and the label is two
  // display strings joined.
  const bySubcategory = new Map<
    string,
    { base: string; cents: number; count: number }
  >();
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
      const stat = bySubcategory.get(label) ?? { base, cents: 0, count: 0 };
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
    entries: [string, string, { cents: number; count: number }][],
  ): DigestCategory[] =>
    entries
      .sort((a, b) => b[2].cents - a[2].cents || b[2].count - a[2].count)
      .slice(0, TOP_CATEGORIES)
      .map(([id, label, stat]) => ({
        id,
        label,
        spent: money(stat.cents),
        count: stat.count,
        sharePct: pct(stat.cents, spentCents),
        averageEntry: money(divide(stat.cents, stat.count)),
      }));

  const categories = toStats(
    [...byCategory].map(([id, stat]) => [id, categoryLabel(id), stat]),
  );
  const subcategories = toStats(
    [...bySubcategory].map(([label, stat]) => [stat.base, label, stat]),
  );

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

  // --- the first whole month against the last whole one, per category ---
  //
  // Whole months only, and compared on their totals. See DigestChange for why
  // a part-finished month is left out rather than scaled: scaling it invents
  // movement in every category that is charged once a month.
  const monthOverMonth: DigestChange[] = [];
  const whole = months.filter((m) => m.days === daysInCalendarMonth(m.key));
  if (whole.length > 1) {
    const firstEntry = whole[0];
    const lastEntry = whole[whole.length - 1];
    const firstMonth = monthSpendCents.get(firstEntry.key)!;
    const lastMonth = monthSpendCents.get(lastEntry.key)!;
    for (const id of new Set([...firstMonth.keys(), ...lastMonth.keys()])) {
      const first = firstMonth.get(id) ?? 0;
      const last = lastMonth.get(id) ?? 0;
      monthOverMonth.push({
        category: categoryLabel(id),
        first: money(first),
        last: money(last),
        firstMonth: firstEntry.label,
        lastMonth: lastEntry.label,
        firstDays: firstEntry.days,
        lastDays: lastEntry.days,
        changePct: first === 0 ? null : pct(last - first, first),
        direction:
          first === 0
            ? "new"
            : last === first
              ? "flat"
              : last > first
                ? "up"
                : "down",
      });
    }
    monthOverMonth.sort((a, b) => b.last.cents - a.last.cents);
  }

  const expenseAmounts = spending.map((r) => r.amount_usd_cents);

  return {
    version: 2,
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
    saving: {
      intoSafe: money(intoSafeCents),
      outOfSafe: money(outOfSafeCents),
      netIntoSafe: signedMoney(intoSafeCents - outOfSafeCents),
      savedSharePct: share(intoSafeCents - outOfSafeCents, incomeCents),
      leftOverSharePct: share(incomeCents - spentCents, incomeCents),
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
