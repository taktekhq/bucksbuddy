// The Recap's numbers: everything a month's card says, worked out once from
// the month's complete, decrypted rows. Pure functions, no React, no
// network — the query lives in lib/recapQuery, the titles in lib/recapTitles,
// the drawing in components/recap.
//
// Two kinds of fact live here. Spending facts (which categories, what share)
// come only from money OUT — income, refunds and moves into the Safe never
// count. Logging facts (which days had an entry, the longest run of them)
// count every row, because they measure the habit, not the money: they are
// what earns a card its rarity, so the only way to a better card is to open
// the app and log — never to spend more or less.

import { EXPENSE_CATEGORIES, SAFE_CATEGORY_ID, splitCategory } from "@/lib/categories";
import { currentMonthRange } from "@/lib/dates";
import type { Transaction } from "@/types/db";

export type RecapStyle = "card" | "story";

// --- Months -----------------------------------------------------------------

/** "2026-09" for the local month containing `date`. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The first day (local midnight) of a "YYYY-MM" key, or null if it isn't one. */
export function parseMonthKey(key: string): Date | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!m) return null;
  // Built in two steps: the Date constructor reads a year under 100 as 19xx.
  const date = new Date(2000, Number(m[2]) - 1, 1, 0, 0, 0, 0);
  date.setFullYear(Number(m[1]));
  return date;
}

/** The key `delta` months away from a valid key (negative = earlier). */
export function shiftMonthKey(key: string, delta: number): string {
  const date = parseMonthKey(key)!;
  date.setMonth(date.getMonth() + delta);
  return monthKey(date);
}

/**
 * The month a "#/recap?month=YYYY-MM" hash asks for — that month when it's
 * well-formed and not in the future, else the current one.
 */
export function monthKeyFromHash(hash: string, now = new Date()): string {
  const value = new URLSearchParams(hash.split("?")[1] ?? "").get("month") ?? "";
  const current = monthKey(now);
  return parseMonthKey(value) && value <= current ? value : current;
}

/** "SEP 2026" — the card's edition mark. */
export function editionLabel(month: Date): string {
  return month
    .toLocaleDateString("en-US", { month: "short", year: "numeric" })
    .toUpperCase();
}

// --- Facts ------------------------------------------------------------------

export type Bucket = {
  id: string; // base category id: "food", never "food/delivery"
  label: string; // "Food"
  cents: number;
  entries: number;
  share: number; // of the month's spending, 0..1
};

export type SplitBucket = Bucket & {
  percent: number; // whole-number share; the split's percents total 100
};

// A row the card can't be built from: a masked amount (this device is
// locked), or a value that isn't a non-negative finite number. Blocks the
// export rather than quietly dropping the row.
export class RecapDataError extends Error {
  constructor() {
    super("invalid");
    this.name = "RecapDataError";
  }
}

export type MonthFacts = {
  key: string; // "2026-09"
  month: Date; // first day, local midnight
  current: boolean; // the month `now` is in — still filling up
  daysInMonth: number;
  daysAvailable: number; // days that could have been logged: so far, or all
  totalCents: number; // positive spending
  entries: number; // positive spending rows
  categories: Bucket[]; // every category, biggest first
  split: SplitBucket[]; // the top three plus "Everything else"
  loggedDays: number[]; // days of the month with any row at all, ascending
  daysLogged: number;
  streak: number; // longest run of consecutive logged days
  weekendShare: number; // spending rows on Sat/Sun, 0..1 of entries
  lateNightShare: number; // spending rows at 22:00–04:59, 0..1 of entries
  earlyShare: number; // spending rows at 05:00–08:59, 0..1 of entries
  subEntries: Record<string, number>; // "food/delivery" → spending rows
  currencies: number; // distinct currencies the spending was typed in
  biggestEntryShare: number; // the largest single row, 0..1 of totalCents
  busiestDay: number; // most spending rows on one day
};

/** How many top categories get their own row before "Everything else". */
export const SPLIT_SIZE = 3;
export const REST_ID = "rest";

const CATEGORY_LABEL = new Map(EXPENSE_CATEGORIES.map((c) => [c.id, c.label]));

// Whole-number percentages that add up to exactly 100: each bucket floors,
// then the leftover points go to the largest remainders, ties by display
// order. Integer arithmetic throughout, so equal remainders really tie.
function largestRemainder(buckets: Bucket[], total: number): SplitBucket[] {
  const split = buckets.map((b) => ({
    ...b,
    percent: Math.floor((b.cents * 100) / total),
    remainder: (b.cents * 100) % total,
  }));
  const order = split
    .map((b, index) => ({ index, remainder: b.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  let missing = 100 - split.reduce((sum, b) => sum + b.percent, 0);
  for (const { index } of order) {
    if (missing === 0) break;
    split[index].percent += 1;
    missing -= 1;
  }
  return split.map(({ remainder: _remainder, ...b }) => b);
}

/**
 * Everything the card needs to know about the month `key`, from that month's
 * rows (other months' rows are ignored). Throws RecapDataError if any row
 * can't be trusted.
 */
export function monthFacts(rows: Transaction[], key: string, now = new Date()): MonthFacts {
  const month = parseMonthKey(key)!;
  const { from, to } = currentMonthRange(month);
  const current = monthKey(now) === key;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const daysAvailable = current ? now.getDate() : daysInMonth;

  const seen = new Set<string>();
  const loggedDays = new Set<number>();
  const byCategory = new Map<string, Bucket>();
  const subEntries: Record<string, number> = {};
  const currencies = new Set<string>();
  const rowsByDay = new Map<number, number>();
  let totalCents = 0;
  let entries = 0;
  let weekend = 0;
  let lateNight = 0;
  let early = 0;
  let biggest = 0;

  for (const row of rows) {
    const at = new Date(row.occurred_at);
    if (at < from || at >= to || seen.has(row.id)) continue;
    seen.add(row.id);
    loggedDays.add(at.getDate());

    const { base, sub } = splitCategory(row.category);
    if (row.is_income || base === SAFE_CATEGORY_ID) continue;
    if (
      row.amountMask != null ||
      !Number.isFinite(row.amount_usd_cents) ||
      row.amount_usd_cents < 0
    ) {
      throw new RecapDataError();
    }
    const cents = row.amount_usd_cents;
    if (cents === 0) continue;

    const id = CATEGORY_LABEL.has(base) ? base : "other";
    let bucket = byCategory.get(id);
    if (!bucket) {
      bucket = { id, label: CATEGORY_LABEL.get(id)!, cents: 0, entries: 0, share: 0 };
      byCategory.set(id, bucket);
    }
    bucket.cents += cents;
    bucket.entries += 1;
    if (sub) {
      const subKey = `${id}/${sub}`;
      subEntries[subKey] = (subEntries[subKey] ?? 0) + 1;
    }
    totalCents += cents;
    entries += 1;
    currencies.add(row.original_currency);
    const day = at.getDay();
    if (day === 0 || day === 6) weekend += 1;
    const hour = at.getHours();
    if (hour >= 22 || hour < 5) lateNight += 1;
    else if (hour < 9) early += 1;
    if (cents > biggest) biggest = cents;
    rowsByDay.set(at.getDate(), (rowsByDay.get(at.getDate()) ?? 0) + 1);
  }

  const categories = [...byCategory.values()].sort(
    (a, b) => b.cents - a.cents || (a.id < b.id ? -1 : 1),
  );
  for (const bucket of categories) bucket.share = bucket.cents / totalCents;

  const top = categories.slice(0, SPLIT_SIZE);
  const rest = categories.slice(SPLIT_SIZE);
  if (rest.length > 0) {
    const cents = rest.reduce((sum, b) => sum + b.cents, 0);
    top.push({
      id: REST_ID,
      label: "Everything else",
      cents,
      entries: rest.reduce((sum, b) => sum + b.entries, 0),
      share: cents / totalCents,
    });
  }
  const split = totalCents > 0 ? largestRemainder(top, totalCents) : [];

  const days = [...loggedDays].sort((a, b) => a - b);
  let streak = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > streak) streak = run;
  }

  return {
    key,
    month,
    current,
    daysInMonth,
    daysAvailable,
    totalCents,
    entries,
    categories,
    split,
    loggedDays: days,
    daysLogged: days.length,
    streak,
    weekendShare: entries > 0 ? weekend / entries : 0,
    lateNightShare: entries > 0 ? lateNight / entries : 0,
    earlyShare: entries > 0 ? early / entries : 0,
    subEntries,
    currencies: currencies.size,
    biggestEntryShare: totalCents > 0 ? biggest / totalCents : 0,
    busiestDay: Math.max(0, ...rowsByDay.values()),
  };
}

/** A base category's share of spending, 0 when it isn't there. */
export function shareOf(facts: MonthFacts, id: string): number {
  return facts.categories.find((c) => c.id === id)?.share ?? 0;
}

/** A base category's rank, 1 = biggest; 0 when it isn't there. */
export function rankOf(facts: MonthFacts, id: string): number {
  return facts.categories.findIndex((c) => c.id === id) + 1;
}

/** Spending rows in a base category. */
export function entriesOf(facts: MonthFacts, id: string): number {
  return facts.categories.find((c) => c.id === id)?.entries ?? 0;
}

/** Spending rows under a subcategory ("food", "delivery"). */
export function subEntriesOf(facts: MonthFacts, base: string, sub: string): number {
  return facts.subEntries[`${base}/${sub}`] ?? 0;
}

/** A subcategory's share of its parent's rows, 0..1 (0 when the parent is empty). */
export function subShare(facts: MonthFacts, base: string, sub: string): number {
  const parent = entriesOf(facts, base);
  return parent > 0 ? subEntriesOf(facts, base, sub) / parent : 0;
}

// --- Rarity -----------------------------------------------------------------

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

// Rarity is coverage: the share of the month's days with at least one entry.
// A long unbroken streak earns a tier too (`streak`), so a fortnight of
// daily logging shows on the card even in a month that started quiet. It
// has nothing to do with money, so the card can only be improved by logging.
// Legendary means every single day, and only that.
export const RARITIES: { id: Rarity; label: string; min: number; streak: number }[] = [
  { id: "common", label: "Common", min: 0, streak: 0 },
  { id: "uncommon", label: "Uncommon", min: 0.35, streak: 7 },
  { id: "rare", label: "Rare", min: 0.6, streak: 14 },
  { id: "epic", label: "Epic", min: 0.8, streak: 21 },
  { id: "legendary", label: "Legendary", min: 1, streak: Infinity },
];

// In the first days of a month one entry would cover 100% of it; measuring
// against at least a week keeps Legendary something you earn.
const MIN_COVERAGE_DAYS = 7;

/** Days logged over days available (at least a week's worth), 0..1. */
export function coverage(facts: MonthFacts): number {
  return Math.min(1, facts.daysLogged / Math.max(facts.daysAvailable, MIN_COVERAGE_DAYS));
}

export function rarityOf(facts: MonthFacts): Rarity {
  const c = coverage(facts);
  let rarity: Rarity = "common";
  for (const tier of RARITIES) {
    if (c >= tier.min || facts.streak >= tier.streak) rarity = tier.id;
  }
  return rarity;
}

export function rarityLabel(rarity: Rarity): string {
  return RARITIES.find((r) => r.id === rarity)!.label;
}

/** 1 (common) … 5 (legendary): the stars in the footer. */
export function rarityStars(rarity: Rarity): number {
  return RARITIES.findIndex((r) => r.id === rarity) + 1;
}

/**
 * What the current month still has in it: the tier above this one and how
 * many more days would have to be logged by month's end to reach it by
 * coverage — or null for a past month, a month already Legendary, or one
 * with too few days left to make it (today counts if nothing's logged yet).
 */
export function nextRarity(facts: MonthFacts): { rarity: Rarity; days: number } | null {
  if (!facts.current) return null;
  const next = RARITIES[rarityStars(rarityOf(facts))];
  if (!next) return null;
  const today = facts.daysAvailable;
  const daysLeft = facts.daysInMonth - today + (facts.loggedDays.includes(today) ? 0 : 1);
  const needed = Math.ceil(next.min * facts.daysInMonth) - facts.daysLogged;
  return needed <= daysLeft ? { rarity: next.id, days: needed } : null;
}

// --- The name on the card ---------------------------------------------------

export const NAME_MAX = 24;

/**
 * The display name as typed, made safe for a card: control and formatting
 * characters out, whitespace collapsed, at most NAME_MAX characters (counted
 * by code point, so an emoji is one).
 */
export function cleanName(value: string): string {
  return Array.from(
    value.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim(),
  )
    .slice(0, NAME_MAX)
    .join("")
    .trim();
}
