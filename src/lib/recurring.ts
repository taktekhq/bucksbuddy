// Recurring payments, detected from the entries a user has already logged.
//
// BucksBuddy has no "subscription" object: rent, salary, Netflix and the gym
// are all just entries, typed once a month like everything else. This module
// finds them after the fact. It is a pure function over the decrypted
// transactions (like lib/stats.ts), so it runs on the device, works on
// end-to-end encrypted data, and needs no schema change — and it is scoped to
// one user id, so a caller can never mix two accounts' rows together.
//
// How a series is recognised (proof of concept — deliberately simple):
//   1. Entries are bucketed by direction + category + note (the note, when
//      present, is what tells "Netflix" from "Spotify" under Fees · Subscriptions).
//   2. A bucket needs at least MIN_OCCURRENCES entries.
//   3. The gaps between consecutive entries must all fall inside one cadence's
//      window (weekly, every two weeks, monthly, yearly).
//   4. Every amount must sit within AMOUNT_TOLERANCE of the bucket's median,
//      so a weekly grocery run with wildly different totals doesn't count.
// Anything money-valued here is wrong while the device is locked (masked rows
// carry amount_usd_cents: 0); callers check `anyMasked` first.

import type { Transaction } from "@/types/db";

export type Cadence = "weekly" | "biweekly" | "monthly" | "yearly";

export const MIN_OCCURRENCES = 3;
export const AMOUNT_TOLERANCE = 0.15; // ±15% of the median amount

const DAY_MS = 24 * 60 * 60 * 1000;

// Nominal spacing per cadence, and the window of day-gaps that still counts —
// wide enough for "the 1st" vs "the 3rd", a weekend shift, or February.
const CADENCES: { cadence: Cadence; days: number; min: number; max: number }[] = [
  { cadence: "weekly", days: 7, min: 5, max: 9 },
  { cadence: "biweekly", days: 14, min: 12, max: 16 },
  { cadence: "monthly", days: 30, min: 26, max: 35 },
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
  note: string | null; // the shared note, as first typed (null when none)
  cadence: Cadence;
  amountCents: number; // the typical (median) amount in home cents
  monthlyCents: number; // the same, normalised to a per-month figure
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

function noteKey(note: string | null): string {
  return (note ?? "").trim().toLowerCase();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Whole days between two ISO timestamps, rounded. */
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

/** The one cadence every gap fits, or null when the spacing is irregular. */
export function cadenceOf(gapsInDays: number[]): Cadence | null {
  for (const c of CADENCES) {
    if (gapsInDays.every((g) => g >= c.min && g <= c.max)) return c.cadence;
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
    const key = `${r.is_income}:${r.category}:${noteKey(r.note)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(r);
    else buckets.set(key, [r]);
  }

  const payments: RecurringPayment[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < MIN_OCCURRENCES) continue;

    // ISO timestamps are fixed-width, so lexical compare == chronological.
    const asc = [...bucket].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const gaps: number[] = [];
    for (let i = 1; i < asc.length; i++) {
      gaps.push(daysBetween(asc[i - 1].occurred_at, asc[i].occurred_at));
    }
    const cadence = cadenceOf(gaps);
    if (!cadence) continue;

    const amountCents = median(asc.map((r) => r.amount_usd_cents));
    const slack = amountCents * AMOUNT_TOLERANCE;
    if (asc.some((r) => Math.abs(r.amount_usd_cents - amountCents) > slack)) continue;

    const first = asc[0];
    const last = asc[asc.length - 1];
    const nominal = CADENCES.find((c) => c.cadence === cadence)!.days;
    const nextDue = new Date(new Date(last.occurred_at).getTime() + nominal * DAY_MS);

    payments.push({
      key,
      category: first.category,
      isIncome: first.is_income,
      note: first.note?.trim() || null,
      cadence,
      amountCents,
      monthlyCents: monthlyEquivalent(amountCents, cadence),
      count: asc.length,
      firstAt: first.occurred_at,
      lastAt: last.occurred_at,
      nextDueAt: nextDue.toISOString(),
      overdue: nextDue < now,
      rows: [...asc].reverse(),
    });
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
