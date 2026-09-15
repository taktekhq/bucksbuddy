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

import { splitCategory } from "@/lib/categories";
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

export type ParsedNote = {
  text: string; // the note with any cadence hint removed, whitespace collapsed
  cadence: Cadence | null; // the hint, when there was one
};

/** Split a raw note into its text and the cadence hint it may carry. */
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
  text = text.replace(/\s+/g, " ").replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, "");
  return { text, cadence };
}

// Words that say nothing about *what* the payment is, so sharing one of them
// must not make two notes match ("Netflix bill" vs "gym bill").
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "per", "pay", "paid",
  "payment", "bill", "bills", "fee", "fees", "sub", "subs", "subscription",
  "month", "months", "year", "years", "week", "weeks", "new", "old", "one",
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

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2);
    out.set(b, (out.get(b) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice similarity on character bigrams, 0..1. Catches typos. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ba = bigrams(a);
  const bb = bigrams(b);
  let shared = 0;
  for (const [g, n] of ba) shared += Math.min(n, bb.get(g) ?? 0);
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

// A transposed pair of letters ("netlfix") scores exactly 0.5 on bigrams, so
// the bar sits there; unrelated words land well below it.
export const SIMILARITY_THRESHOLD = 0.5;

/**
 * Do two normalized notes mean the same thing? Yes when they're equal, one
 * contains the other, they share a meaningful word, or they're a typo apart.
 * Two empty notes match each other; an empty note matches nothing else.
 */
export function notesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a === "" || b === "") return false;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
  const ta = noteTokens(a);
  const tb = new Set(noteTokens(b));
  if (ta.some((w) => tb.has(w))) return true;
  // Typo tolerance needs something to compare: two-letter notes share half
  // their bigrams with almost anything.
  return a.length >= 3 && b.length >= 3 && similarity(a, b) >= SIMILARITY_THRESHOLD;
}

/**
 * Past notes worth offering while typing a new one: the distinct notes already
 * used in this direction + base category, most recent first, narrowed to those
 * containing what's been typed so far. What's typed exactly is left out —
 * there's nothing to tap for.
 */
export function noteSuggestions(
  rows: Transaction[],
  opts: { isIncome: boolean; category: string; query: string; limit?: number },
): string[] {
  const base = splitCategory(opts.category).base;
  const query = normalizeNote(opts.query);
  const seen = new Set<string>();
  const out: string[] = [];
  // ISO timestamps are fixed-width, so lexical compare == chronological.
  const sorted = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  for (const r of sorted) {
    if (r.is_income !== opts.isIncome || splitCategory(r.category).base !== base) continue;
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
