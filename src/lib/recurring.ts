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
//      only have to *mean* the same thing (see lib/notes: a shared word or a
//      typo apart), not read the same.
//      Who it was "with" is dropped first, so "dinner with Sara" and "lunch
//      with Sara" don't merge on her name.
//   2. A note can say how often it recurs — "Domain (yearly)" — and that hint
//      is taken at its word, even for a single entry. "Subscription" or
//      "membership" in the note says it recurs without saying how often: the
//      dates decide, and monthly is assumed until they can.
//   3. Otherwise a series needs MIN_OCCURRENCES entries whose spacing fits one
//      cadence (weekly, every two weeks, monthly, yearly), with slack for a
//      log that's a day or two late and for one skipped log in between.
//      Entries within MERGE_DAYS of each other count as one occurrence, so a
//      double log doesn't break the rhythm.
//   4. A payment that stops, stops showing: once a whole period has passed
//      beyond its due date with nothing logged, it's gone. Logged again within
//      that time, it carries on. A longer break splits the series — the
//      entries after it start counting from scratch, as a new series.
//   5. Amounts matter most: each is compared to the price it followed. Within
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
  count: number; // how many times it has been logged since the series (re)started
  firstAt: string; // ISO, oldest occurrence of the live series
  lastAt: string; // ISO, newest occurrence
  nextDueAt: string; // ISO, lastAt + the cadence's nominal spacing
  overdue: boolean; // nextDueAt is already behind `now`
  rows: Transaction[]; // every entry of the live series, newest first
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

function spec(cadence: Cadence) {
  return CADENCES.find((c) => c.cadence === cadence)!;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The cadence the typical gap points at: the one whose window holds the
 * median gap, or failing that the one it fits twice over (a series with a
 * skipped log here and there). Null when no cadence comes close.
 */
export function pickCadence(gapsInDays: number[]): Cadence | null {
  if (gapsInDays.length === 0) return null;
  const m = median(gapsInDays);
  for (const c of CADENCES) if (m >= c.min && m <= c.max) return c.cadence;
  for (const c of CADENCES) if (m >= 2 * c.min && m <= 2 * c.max) return c.cadence;
  return null;
}

/**
 * Do the gaps keep to the cadence? Every gap must fit its window once or
 * twice over (one skipped log), and at least half must fit it once —
 * otherwise "every 14 days" would read as weekly-with-skips.
 */
export function fitsCadence(cadence: Cadence, gapsInDays: number[]): boolean {
  const c = spec(cadence);
  let once = 0;
  for (const g of gapsInDays) {
    if (g >= c.min && g <= c.max) once += 1;
    else if (g < 2 * c.min || g > 2 * c.max) return false;
  }
  return once * 2 >= gapsInDays.length;
}

/** The cadence the gaps fit, or null when the spacing is irregular. */
export function cadenceOf(gapsInDays: number[]): Cadence | null {
  const cadence = pickCadence(gapsInDays);
  return cadence && fitsCadence(cadence, gapsInDays) ? cadence : null;
}

/**
 * A break longer than this, in days, ends a series at that cadence: what
 * comes after starts over as a new one. It's the longest gap a skipped log
 * could explain.
 */
export function breakAfterDays(cadence: Cadence): number {
  return 2 * spec(cadence).max;
}

/**
 * How long, in days, a series stays alive after its last entry: one full
 * period beyond the latest date the next entry could still be on time.
 */
export function aliveForDays(cadence: Cadence): number {
  const c = spec(cadence);
  return c.days + c.max;
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
      const parsed = asc.map((r) => parseNote(r.note));

      // Occurrences: consecutive entries within MERGE_DAYS fold into one, so
      // a double log doesn't break the rhythm. Each keeps its rows.
      const occurrences: { at: string; rows: Transaction[] }[] = [];
      for (const r of asc) {
        const prev = occurrences[occurrences.length - 1];
        if (prev && daysBetween(prev.at, r.occurred_at) <= MERGE_DAYS) prev.rows.push(r);
        else occurrences.push({ at: r.occurred_at, rows: [r] });
      }
      const gaps = occurrences.slice(1).map((o, i) => daysBetween(occurrences[i].at, o.at));

      // The user's own word wins: the latest cadence hint sets the cadence;
      // "subscription" / "membership" says it recurs and leaves the dates to
      // say how often (monthly until they can). Either way a hinted entry
      // recurs even if it's the only one so far.
      const cadenceHint = [...parsed].reverse().find((p) => p.cadence)?.cadence ?? null;
      const recurringHint = parsed.some((p) => p.recurring);
      const hinted = cadenceHint !== null || recurringHint;
      const cadence = cadenceHint ?? pickCadence(gaps) ?? (recurringHint ? "monthly" : null);
      if (!cadence) continue;

      // A break too long for a skipped log splits the series; only what
      // comes after the last break is the live series.
      let start = 0;
      gaps.forEach((g, i) => {
        if (g > breakAfterDays(cadence)) start = i + 1;
      });
      const live = occurrences.slice(start);
      const liveGaps = gaps.slice(start);
      if (!hinted && (live.length < MIN_OCCURRENCES || !fitsCadence(cadence, liveGaps))) continue;

      // Stopped: a whole period past its due date with nothing logged.
      const last = live[live.length - 1];
      if (daysBetween(last.at, now.toISOString()) > aliveForDays(cadence)) continue;

      const liveRows = live.flatMap((o) => o.rows);
      const price = priceTrack(liveRows.map((r) => r.amount_usd_cents));
      if (!price) continue;

      const first = liveRows[0];
      const noteText = parseNote(liveRows[liveRows.length - 1].note).text;
      const nextDue = new Date(new Date(last.at).getTime() + spec(cadence).days * DAY_MS);

      payments.push({
        key: `${bucketKey}:${normalizeNote(noteText)}`,
        category: first.category,
        isIncome: first.is_income,
        note: noteText || null,
        cadence,
        fromNote: cadenceHint !== null,
        amountCents: price.current,
        previousAmountCents: price.previous,
        monthlyCents: monthlyEquivalent(price.current, cadence),
        count: live.length,
        firstAt: first.occurred_at,
        lastAt: last.at,
        nextDueAt: nextDue.toISOString(),
        overdue: nextDue < now,
        rows: [...liveRows].reverse(),
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
