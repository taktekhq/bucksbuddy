// Notes are free text typed in a hurry, so two notes about the same thing are
// rarely identical: "Netflix", "netflix ", "Netflix sub", "Netlfix". This
// module is the one place that decides when two notes mean the same thing —
// used by the recurring-payments detector to fold such entries together, and
// by the composer to suggest past notes so they stop drifting in the first
// place. Plain string matching, on the device: no model, nothing leaves.
//
// A note can also carry a cadence hint — "Domain (yearly)", "gym monthly" —
// which the detector takes as the user's word on how often it recurs. The hint
// is peeled off here so it never gets in the way of matching.

import type { Transaction } from "@/types/db";

export type Cadence = "weekly" | "biweekly" | "monthly" | "yearly";

// Order matters: "biweekly" has to be tried before "weekly". Each pattern also
// eats the brackets it's usually wrapped in and any dangling separator.
const HINTS: { cadence: Cadence; re: RegExp }[] = [
  { cadence: "biweekly", re: /[([]?\s*\b(bi-?weekly|fortnightly|every (?:2|two) weeks)\b\s*[)\]]?/i },
  { cadence: "weekly", re: /[([]?\s*\b(weekly|every week|per week|a week)\b\s*[)\]]?/i },
  { cadence: "monthly", re: /[([]?\s*\b(monthly|every month|per month|a month)\b\s*[)\]]?/i },
  { cadence: "yearly", re: /[([]?\s*\b(yearly|annual(?:ly)?|every year|per year|a year)\b\s*[)\]]?/i },
];

// Words that say "this one comes back" without saying how often. Read, then
// dropped from the text, so "Claude subscription" and a later plain "Claude"
// are the same series — the word is a cheat code, not part of the name.
const RECURRING_WORDS = /\b(subscriptions?|memberships?)\b/i;

// "Dinner with Sara", "Lunch with Sara": who it was with is not what it was.
// Everything from "with" on is dropped before notes are compared, so the two
// don't merge on the name — and "Netflix with Ali" every month is still Netflix.
const WITH_SUFFIX = /\bwith\b.*$/i;

export type ParsedNote = {
  // The note with the hints and "with …" removed, whitespace collapsed.
  text: string;
  cadence: Cadence | null; // the cadence hint, when there was one
  recurring: boolean; // the note called itself a subscription or membership
};

/** Split a raw note into its text and the hints it may carry. */
export function parseNote(raw: string | null): ParsedNote {
  let text = raw ?? "";
  let cadence: Cadence | null = null;
  for (const h of HINTS) {
    if (h.re.test(text)) {
      cadence = h.cadence;
      text = text.replace(h.re, " ");
      break;
    }
  }
  const recurring = RECURRING_WORDS.test(text);
  // The hints are read first: "Netflix with Ali (monthly)" keeps its cadence.
  text = text
    .replace(RECURRING_WORDS, " ")
    .replace(WITH_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, "");
  return { text, cadence, recurring };
}

// Words that say nothing about *what* the payment is, so sharing one of them
// must not make two notes match ("Netflix bill" vs "gym bill").
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "per", "pay", "paid",
  "payment", "bill", "bills", "fee", "fees", "sub", "subs", "subscription",
  "subscriptions", "membership", "memberships", "month", "months", "year",
  "years", "week", "weeks", "new", "old", "one",
]);

/** Lowercase, accents stripped, punctuation folded to spaces. */
export function normalizeNote(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The meaningful words of a normalized note. */
export function noteTokens(normalized: string): string[] {
  return normalized.split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Damerau–Levenshtein (optimal string alignment) distance: the edits —
 * insert, delete, replace, or swap two neighbours — that turn `a` into `b`.
 */
export function editDistance(a: string, b: string): number {
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// One slip — a missed, extra, wrong or swapped letter — is a typo. Two is a
// different word ("lunch" / "brunch", "spotify" / "shopify"). Only words long
// enough to carry a typo qualify; short ones are a slip away from anything.
export const TYPO_DISTANCE = 1;
const TYPO_MIN_LENGTH = 4;

function isTypoOf(a: string, b: string): boolean {
  return (
    a.length >= TYPO_MIN_LENGTH &&
    b.length >= TYPO_MIN_LENGTH &&
    Math.abs(a.length - b.length) <= TYPO_DISTANCE &&
    editDistance(a, b) <= TYPO_DISTANCE
  );
}

/**
 * Do two normalized notes mean the same thing? Yes when they're equal, they
 * share a meaningful word, or they're a typo apart — as whole notes or in one
 * of their words. Two empty notes match each other; an empty note matches
 * nothing else.
 */
export function notesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a === "" || b === "") return false;
  const ta = noteTokens(a);
  const tb = noteTokens(b);
  if (ta.some((w) => tb.includes(w))) return true;
  if (isTypoOf(a, b)) return true;
  return ta.some((w) => tb.some((v) => isTypoOf(w, v)));
}

/**
 * Past notes worth offering while typing a new one: the distinct notes already
 * used in this direction + category (the exact one — Fees · Subscriptions
 * doesn't borrow from Fees · Bank), most recent first, narrowed to those
 * containing what's been typed so far. What's typed exactly is left out —
 * there's nothing to tap for.
 */
export function noteSuggestions(
  rows: Transaction[],
  opts: { isIncome: boolean; category: string; query: string; limit?: number },
): string[] {
  const query = normalizeNote(opts.query);
  const seen = new Set<string>();
  const out: string[] = [];
  // ISO timestamps are fixed-width, so lexical compare == chronological.
  const sorted = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  for (const r of sorted) {
    if (r.is_income !== opts.isIncome || r.category !== opts.category) continue;
    const text = (r.note ?? "").replace(/\s+/g, " ").trim();
    if (text === "") continue;
    const norm = normalizeNote(text);
    if (seen.has(norm) || norm === query || !norm.includes(query)) continue;
    seen.add(norm);
    out.push(text);
    if (out.length >= (opts.limit ?? 6)) break;
  }
  return out;
}
