// Recurring payments, detected from the entries a user has already logged.
//
// BucksBuddy has no "subscription" object: rent, salary, Netflix and the gym
// are all just entries, typed once a month like everything else. This module
// finds them after the fact. It is a pure function over the decrypted
// transactions (like lib/stats.ts), so it runs on the device, works on
// end-to-end encrypted data, and needs no schema change — and it is scoped to
// one user id, so a caller can never mix two accounts' rows together.
//
// How a series is recognised — forgiving on purpose, because entries are typed
// by hand, late, and never quite the same way twice:
//   1. Entries are bucketed by direction + category, then by note — but notes
//      only have to *mean* the same thing (see lib/notes: a shared word, one
//      containing the other, or a typo apart), not read the same.
//   2. A note can say how often it recurs — "Domain (yearly)" — and that hint
//      is taken at its word, even for a single entry.
//   3. Otherwise a series needs MIN_OCCURRENCES entries whose spacing fits one
//      cadence (weekly, every two weeks, monthly, yearly), with slack for a
//      log that's a day or two late and for one skipped log in between.
//      Entries within MERGE_DAYS of each other count as one occurrence, so a
//      double log doesn't break the rhythm.
//   4. Amounts matter most: each is compared to the price it followed. Within
//      SAME_PRICE_TOLERANCE it's the same price; a bigger jump (up to
//      PRICE_CHANGE_TOLERANCE) reads as a price change, but only after the old
//      price had held for two entries — so a rising subscription stays in,
//      while amounts that jump around every time are not a payment. The
//      latest amount is reported as the current price.
// Anything money-valued here is wrong while the device is locked (masked rows
// carry amount_usd_cents: 0); callers check `anyMasked` first.

import { normalizeNote, notesMatch, parseNote, type Cadence } from "@/lib/notes";
import type { Transaction } from "@/types/db";

export type { Cadence };

export const MIN_OCCURRENCES = 2;
export const MERGE_DAYS = 2; // entries this close together are one occurrence
export const SAME_PRICE_TOLERANCE = 0.1; // ±10% of the price before it
export const PRICE_CHANGE_TOLERANCE = 0.5; // a price change may move up to ±50%

const DAY_MS = 24 * 60 * 60 * 1000;

// Nominal spacing per cadence, and the window of day-gaps that still counts —
// wide enough for "the 1st" vs "the 3rd", a log that's a couple of days late,
// or February.
const CADENCES: { cadence: Cadence; days: number; min: number; max: number }[] = [
  { cadence: "weekly", days: 7, min: 5, max: 9 },
  { cadence: "biweekly", days: 14, min: 12, max: 16 },
  { cadence: "monthly", days: 30, min: 24, max: 37 },
  { cadence: "yearly", days: 365, min: 350, max: 380 },
];

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
};

export type RecurringPayment = {
  // `${is_income}:${category}:${note}` — the bucket key, stable across renders.
  key: string;
  category: string; // stored id, for icon/label/color lookups
  isIncome: boolean;
  note: string | null; // the latest note in the series, hint removed (null when none)
  cadence: Cadence;
  fromNote: boolean; // the cadence came from a hint in the note, not the dates
  amountCents: number; // the current price, in home cents
  previousAmountCents: number | null; // the price before the last change, if any
  monthlyCents: number; // the current price, normalised to a per-month figure
  count: number; // how many times it has been logged
  firstAt: string; // ISO, oldest occurrence
  lastAt: string; // ISO, newest occurrence
  nextDueAt: string; // ISO, lastAt + the cadence's nominal spacing
  overdue: boolean; // nextDueAt is already behind `now`
  rows: Transaction[]; // every occurrence, newest first
};

export type RecurringSummary = {
  payments: RecurringPayment[]; // outgoings first, then income; nearest due first
  monthlyOutCents: number; // what the recurring outgoings add up to per month
  monthlyInCents: number; // and the recurring income
  anyMasked: boolean; // some row is obscured (locked device): money is a lie
};

/** Whole days between two ISO timestamps, rounded. */
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

/**
 * The cadence the gaps fit, or null when the spacing is irregular. Every gap
 * must fit the cadence's window either once or twice over (one skipped log),
 * and at least half must fit it once — otherwise "every 14 days" would read
 * as weekly-with-skips.
 */
export function cadenceOf(gapsInDays: number[]): Cadence | null {
  if (gapsInDays.length === 0) return null;
  for (const c of CADENCES) {
    let once = 0;
    let ok = true;
    for (const g of gapsInDays) {
      if (g >= c.min && g <= c.max) once += 1;
      else if (g < 2 * c.min || g > 2 * c.max) {
        ok = false;
        break;
      }
    }
    if (ok && once * 2 >= gapsInDays.length) return c.cadence;
  }
  return null;
}

/** A per-month figure for one occurrence at the given cadence. */
export function monthlyEquivalent(cents: number, cadence: Cadence): number {
  switch (cadence) {
    case "weekly":
      return Math.round((cents * 52) / 12);
    case "biweekly":
      return Math.round((cents * 26) / 12);
    case "monthly":
      return cents;
    case "yearly":
      return Math.round(cents / 12);
  }
}

/**
 * Walk the amounts oldest-first and decide whether they behave like one
 * payment: steady, with the odd price change once the old price has held.
 * Returns the latest amount as the current price plus the price before the
 * last change, or null when the amounts jump around too much to be a payment.
 */
export function priceTrack(
  amounts: number[],
): { current: number; previous: number | null } | null {
  let level = amounts[0]; // the price this stretch started at
  let held = 1; // entries at this price so far
  let previous: number | null = null;
  for (let i = 1; i < amounts.length; i++) {
    const a = amounts[i];
    const diff = Math.abs(a - level);
    if (diff <= level * SAME_PRICE_TOLERANCE) {
      held += 1;
    } else if (diff <= level * PRICE_CHANGE_TOLERANCE && held >= 2) {
      previous = level;
      level = a;
      held = 1;
    } else {
      return null;
    }
  }
  return { current: amounts[amounts.length - 1], previous };
}

// Group a bucket's rows by note meaning: every pair of distinct notes that
// match (lib/notes) is joined, so "Netflix" / "netflix sub" / "Netlfix" end up
// together. Notes with nothing left after the hint is removed form their own
// group and never join a named one.
function clusterByNote(rows: Transaction[]): Transaction[][] {
  const norms = rows.map((r) => normalizeNote(parseNote(r.note).text));
  const distinct = [...new Set(norms)];
  const parent = distinct.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      if (notesMatch(distinct[i], distinct[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Transaction[]>();
  rows.forEach((r, k) => {
    const root = find(distinct.indexOf(norms[k]));
    const g = groups.get(root);
    if (g) g.push(r);
    else groups.set(root, [r]);
  });
  return [...groups.values()];
}

/**
 * Detect the recurring payments in `rows` for one user. Rows belonging to any
 * other user id are ignored outright, so the result is always "this user's",
 * whatever the caller hands in.
 */
export function detectRecurring(
  rows: Transaction[],
  userId: string,
  now = new Date(),
): RecurringSummary {
  const buckets = new Map<string, Transaction[]>();
  let anyMasked = false;
  for (const r of rows) {
    if (r.user_id !== userId) continue;
    if (r.amountMask != null) anyMasked = true;
    const key = `${r.is_income}:${r.category}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(r);
    else buckets.set(key, [r]);
  }

  const payments: RecurringPayment[] = [];
  for (const [bucketKey, bucket] of buckets) {
    for (const group of clusterByNote(bucket)) {
      // ISO timestamps are fixed-width, so lexical compare == chronological.
      const asc = [...group].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

      // Gaps between occurrences, with entries logged within MERGE_DAYS of
      // each other folded into one occurrence.
      const gaps: number[] = [];
      let occurrences = 1;
      for (let i = 1; i < asc.length; i++) {
        const gap = daysBetween(asc[i - 1].occurred_at, asc[i].occurred_at);
        if (gap <= MERGE_DAYS) continue;
        gaps.push(gap);
        occurrences += 1;
      }

      // The user's own word wins: the latest hint in the series sets the
      // cadence, and a hinted entry recurs even if it's the only one so far.
      const hinted = asc.map((r) => parseNote(r.note)).reverse().find((p) => p.cadence);
      const cadence = hinted?.cadence ?? (occurrences >= MIN_OCCURRENCES ? cadenceOf(gaps) : null);
      if (!cadence) continue;

      const price = priceTrack(asc.map((r) => r.amount_usd_cents));
      if (!price) continue;

      const first = asc[0];
      const last = asc[asc.length - 1];
      const noteText = parseNote(last.note).text;
      const nominal = CADENCES.find((c) => c.cadence === cadence)!.days;
      const nextDue = new Date(new Date(last.occurred_at).getTime() + nominal * DAY_MS);

      payments.push({
        key: `${bucketKey}:${normalizeNote(noteText)}`,
        category: first.category,
        isIncome: first.is_income,
        note: noteText || null,
        cadence,
        fromNote: hinted !== undefined,
        amountCents: price.current,
        previousAmountCents: price.previous,
        monthlyCents: monthlyEquivalent(price.current, cadence),
        count: occurrences,
        firstAt: first.occurred_at,
        lastAt: last.occurred_at,
        nextDueAt: nextDue.toISOString(),
        overdue: nextDue < now,
        rows: [...asc].reverse(),
      });
    }
  }

  // Outgoings before income (that's what people come here to check), and
  // within each, the one due soonest on top.
  payments.sort(
    (a, b) =>
      Number(a.isIncome) - Number(b.isIncome) || a.nextDueAt.localeCompare(b.nextDueAt),
  );

  let monthlyOutCents = 0;
  let monthlyInCents = 0;
  for (const p of payments) {
    if (p.isIncome) monthlyInCents += p.monthlyCents;
    else monthlyOutCents += p.monthlyCents;
  }

  return { payments, monthlyOutCents, monthlyInCents, anyMasked };
}
