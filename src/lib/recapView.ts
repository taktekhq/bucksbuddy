// What a card shows, worked out once from the month's facts and the user's
// choices, so the two drawings (the trading card and the story) stay dumb:
// they lay out a RecapView and never decide anything themselves.
import type { LucideIcon } from "lucide-react";
import { categoryColor, categoryIcon } from "@/lib/categories";
import {
  nextRarity,
  rarityOf,
  REST_ID,
  type MonthFacts,
  type Rarity,
  type SplitBucket,
} from "@/lib/recap";
import { habitatOf, nickname, revealLine, type Habitat, type RecapTitle } from "@/lib/recapTitles";

export type CardMove = SplitBucket & {
  name: string; // the playful nickname, e.g. "Fork lift"
  color: string;
  icon: LucideIcon;
};

// A decorative glint, positioned in the art zone as fractions of its size.
export type Sparkle = { x: number; y: number; r: number; rotate: number };

export type RecapView = {
  facts: MonthFacts;
  rarity: Rarity;
  title: RecapTitle;
  caption: string | null; // null when the caption is turned off
  name: string; // "" when the name is turned off
  showAmounts: boolean;
  currency: string;
  lead: CardMove; // the leading category — the card's "type"
  second: CardMove | null; // a dual type: the runner-up when it's nearly level
  moves: CardMove[]; // the top categories, biggest first (no remainder)
  rest: SplitBucket | null; // "Everything else", when there is one
  habitat: Habitat; // when the month's logging happened
  reveal: string; // one true, surprising sentence about the month
  stamps: string[]; // other titles the month earned, as short labels
  nextUp: { rarity: Rarity; days: number } | null; // what's still in reach
  sparkles: Sparkle[];
};

export type RecapChoices = {
  title: RecapTitle;
  stamps: RecapTitle[]; // the other eligible titles, best first
  showCaption: boolean;
  showAmounts: boolean;
  name: string; // already cleaned; "" for none
  currency: string;
};

/** At most this many extra titles ride along as stamps. */
export const MAX_STAMPS = 3;

/** A runner-up this close to the lead makes the card a dual type. */
export const DUAL_TYPE_RATIO = 0.8;

// A small, fast, deterministic PRNG (mulberry32) so a month's glints land in
// the same places every time it's rendered, on every device.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const SPARKLES_BY_RARITY: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 4,
  legendary: 7,
};

/** Where this month's glints go — more of them the rarer the card. */
export function sparklesFor(key: string, rarity: Rarity): Sparkle[] {
  const next = seeded(hashKey(key));
  return Array.from({ length: SPARKLES_BY_RARITY[rarity] }, () => ({
    // Kept off the very middle, where the icon sits.
    x: next() < 0.5 ? 0.06 + next() * 0.2 : 0.74 + next() * 0.2,
    y: 0.08 + next() * 0.84,
    r: 0.5 + next() * 0.6,
    rotate: Math.round(next() * 45),
  }));
}

/** Everything the drawings need. Only meaningful once the month has spending. */
export function buildRecapView(facts: MonthFacts, choices: RecapChoices): RecapView {
  const rarity = rarityOf(facts);
  const buckets = facts.split.filter((b) => b.id !== REST_ID);
  const rest = facts.split.find((b) => b.id === REST_ID) ?? null;
  const moves: CardMove[] = buckets.map((b) => ({
    ...b,
    name: nickname(facts, b.id),
    color: categoryColor(b.id),
    icon: categoryIcon(b.id),
  }));
  return {
    facts,
    rarity,
    title: choices.title,
    caption: choices.showCaption ? choices.title.caption : null,
    name: choices.name,
    showAmounts: choices.showAmounts,
    currency: choices.currency,
    lead: moves[0],
    second: moves[1] && moves[1].share >= DUAL_TYPE_RATIO * moves[0].share ? moves[1] : null,
    moves,
    rest,
    habitat: habitatOf(facts),
    reveal: revealLine(facts),
    stamps: choices.stamps
      .filter((t) => t.id !== choices.title.id)
      .slice(0, MAX_STAMPS)
      .map((t) => t.title.replace(/\.$/, "")),
    nextUp: nextRarity(facts),
    sparkles: sparklesFor(facts.key, rarity),
  };
}
