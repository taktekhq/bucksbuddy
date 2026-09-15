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
//      dates decide, and monthly is assumed until they can. A domain name
//      ("sillyguy.com") is yearly. "(ended)" on the latest entry stops it.
//   3. Otherwise a series needs a few entries whose spacing fits one cadence
//      (weekly, every two weeks, monthly, yearly) — two for monthly and
//      yearly, three for the short ones, where two entries a week apart prove
//      little — with slack for a log that's a day or two late and for one
//      skipped log in between. Entries within MERGE_DAYS of each other count
//      as one occurrence, so a double log doesn't break the rhythm.
//   4. A payment that stops, stops showing: once a whole period has passed
//      beyond its due date with nothing logged, it's gone. Logged again within
//      that time, it carries on. A longer break splits the series — the
//      entries after it start counting from scratch, as a new series.
//   5. Amounts matter most: each is compared to the price it followed. Within
//      SAME_PRICE_TOLERANCE it's the same price; a bigger jump (up to
//      PRICE_CHANGE_TOLERANCE) reads as a price change, but only after the old
//      price had held for two entries — so a rising subscription stays in,
//      while amounts that jump around every time are not a payment. An entry
//      that fits neither is an odd one out ("Muay Thai water" next to the
//      monthly "Muay Thai") and is left out, as long as those stay a minority.
//      When the note vouched for the series, the amounts are taken as they
//      come. The latest amount is reported as the current price.
// Anything money-valued here is wrong while the device is locked (masked rows
// carry amount_usd_cents: 0); callers check `anyMasked` first.

import { normalizeNote, notesMatch, parseNote, type Cadence } from "@/lib/notes";
import type { Transaction } from "@/types/db";

export type { Cadence };

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

/** How many occurrences it takes before the dates alone make a series. */
export function minOccurrences(cadence: Cadence): number {
  return cadence === "weekly" || cadence === "biweekly" ? 3 : 2;
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

export type PriceTrack = {
  current: number; // the latest amount that belongs to the series
  previous: number | null; // the price before the last change, if any
  kept: boolean[]; // per amount: part of the series, or an odd one out
};

/**
 * Walk the amounts oldest-first and decide whether they behave like one
 * payment: steady, with the odd price change once the old price has held.
 * An amount that fits neither is an odd one out and skipped. Returns null
 * when the odd ones out are as many as the rest — that's not a payment, it's
 * noise.
 */
export function priceTrack(amounts: number[]): PriceTrack | null {
  let level = amounts[0]; // the price this stretch started at
  let held = 1; // entries at this price so far
  let previous: number | null = null;
  let current = amounts[0];
  const kept = [true];
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
      kept.push(false);
      continue;
    }
    kept.push(true);
    current = a;
  }
  const outliers = kept.filter((k) => !k).length;
  if (outliers * 2 >= kept.length) return null;
  return { current, previous, kept };
}

/**
 * The prices of a series the note vouched for: taken as they come, the
 * latest as the current price and the last one that differed as "previous".
 */
function pricesAsGiven(amounts: number[]): PriceTrack {
  const current = amounts[amounts.length - 1];
  let previous: number | null = null;
  for (let i = amounts.length - 2; i >= 0; i--) {
    if (Math.abs(amounts[i] - current) > current * SAME_PRICE_TOLERANCE) {
      previous = amounts[i];
      break;
    }
  }
  return { current, previous, kept: amounts.map(() => true) };
}

type Occurrence = { at: string; rows: Transaction[] };

// Occurrences of a sorted series: consecutive entries within MERGE_DAYS fold
// into one, so a double log doesn't break the rhythm. Each keeps its rows.
function occurrencesOf(asc: Transaction[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const r of asc) {
    const prev = out[out.length - 1];
    if (prev && daysBetween(prev.at, r.occurred_at) <= MERGE_DAYS) prev.rows.push(r);
    else out.push({ at: r.occurred_at, rows: [r] });
  }
  return out;
}

/** Days between consecutive occurrences. */
function gapsOf(occurrences: Occurrence[]): number[] {
  return occurrences.slice(1).map((o, i) => daysBetween(occurrences[i].at, o.at));
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
      const sorted = [...group].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
      const parsed = sorted.map((r) => parseNote(r.note));

      // The user's own word wins: the latest cadence hint sets the cadence;
      // "subscription" / "membership" says it recurs and leaves the dates to
      // say how often (monthly until they can). Either way a hinted entry
      // recurs even if it's the only one so far, and its amounts are taken
      // as they come.
      const cadenceHint = [...parsed].reverse().find((p) => p.cadence)?.cadence ?? null;
      const recurringHint = parsed.some((p) => p.recurring);
      const hinted = cadenceHint !== null || recurringHint;

      // The cadence, from everything logged: the typical gap is robust to the
      // odd entry, and knowing it is what tells a break from a skipped log.
      const all = occurrencesOf(sorted);
      const cadence =
        cadenceHint ?? pickCadence(gapsOf(all)) ?? (recurringHint ? "monthly" : null);
      if (!cadence) continue;

      // A break too long for a skipped log splits the series; only what
      // comes after the last break is the live series.
      let start = 0;
      gapsOf(all).forEach((g, i) => {
        if (g > breakAfterDays(cadence)) start = i + 1;
      });
      const segment = all.slice(start).flatMap((o) => o.rows);

      // Then the amounts of the live series: the odd ones out ("Muay Thai
      // water" among the monthly "Muay Thai") are left out of it.
      const price = hinted
        ? pricesAsGiven(segment.map((r) => r.amount_usd_cents))
        : priceTrack(segment.map((r) => r.amount_usd_cents));
      if (!price) continue;
      const liveRows = segment.filter((_, i) => price.kept[i]);
      const live = occurrencesOf(liveRows);
      if (!hinted && (live.length < minOccurrences(cadence) || !fitsCadence(cadence, gapsOf(live)))) {
        continue;
      }

      // Stopped: the latest entry says so, or a whole period has passed
      // beyond its due date with nothing logged.
      const last = live[live.length - 1];
      if (parseNote(liveRows[liveRows.length - 1].note).ended) continue;
      if (daysBetween(last.at, now.toISOString()) > aliveForDays(cadence)) continue;

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
