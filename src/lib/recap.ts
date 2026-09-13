import { EXPENSE_CATEGORIES, splitCategory } from "./categories";
import { currentMonthRange } from "./dates";
import type { Transaction } from "@/types/db";

export type RecapStyle = "trading" | "monthly";
export type RecapBucket = {
  id: string;
  label: string;
  cents: number;
  entries: number;
  share: number;
  percent: number;
};
export type Recap = {
  total: number;
  entries: number;
  categories: RecapBucket[];
  split: RecapBucket[];
};

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonth(value: string, now = new Date()): Date {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
    value > monthKey(now) ||
    value < "0001-01"
  ) {
    throw new Error("month");
  }
  // setFullYear avoids Date's special interpretation of years 0–99.
  const date = new Date(0);
  date.setFullYear(Number(value.slice(0, 4)), Number(value.slice(5)) - 1, 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function initialRecapMonth(hash: string): string {
  const value = new URLSearchParams(hash.split("?")[1]).get("month");
  try {
    return monthKey(parseMonth(value ?? ""));
  } catch {
    return monthKey();
  }
}

export function recapName(value: string): string {
  return Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim())
    .slice(0, 24)
    .join("");
}

export function aggregateRecap(rows: Transaction[], month: Date): Recap {
  const { from, to } = currentMonthRange(month);
  const buckets = new Map<string, RecapBucket>();
  const seen = new Set<string>();
  let total = 0,
    entries = 0;
  for (const row of rows) {
    const date = new Date(row.occurred_at);
    const base = splitCategory(row.category).base;
    if (
      date < from ||
      date >= to ||
      row.is_income !== false ||
      base === "safe" ||
      seen.has(row.id)
    )
      continue;
    seen.add(row.id);
    if (
      !Number.isFinite(date.getTime()) ||
      row.amountMask != null ||
      !Number.isSafeInteger(row.amount_usd_cents) ||
      row.amount_usd_cents < 0
    )
      throw new Error("invalid_data");
    if (row.amount_usd_cents === 0) continue;
    const category =
      EXPENSE_CATEGORIES.find((c) => c.id === base) ??
      EXPENSE_CATEGORIES.find((c) => c.id === "other")!;
    const bucket = buckets.get(category.id) ?? {
      id: category.id,
      label: category.label,
      cents: 0,
      entries: 0,
      share: 0,
      percent: 0,
    };
    bucket.cents += row.amount_usd_cents;
    bucket.entries++;
    buckets.set(bucket.id, bucket);
    total += row.amount_usd_cents;
    entries++;
    if (!Number.isSafeInteger(total)) throw new Error("invalid_data");
  }
  const categories = [...buckets.values()].sort(
    (a, b) => b.cents - a.cents || (a.id < b.id ? -1 : 1),
  );
  for (const bucket of categories) bucket.share = bucket.cents / total;
  const split = categories.slice(0, 2).map((b) => ({ ...b }));
  if (categories.length > 2) {
    const rest = categories.slice(2);
    const cents = rest.reduce((sum, b) => sum + b.cents, 0);
    split.push({
      id: "remainder",
      label: "Everything else",
      cents,
      entries: rest.reduce((sum, b) => sum + b.entries, 0),
      share: cents / total,
      percent: 0,
    });
  }
  // Integer remainders avoid floating-point tie drift. All sums fit safe integers;
  // BigInt also keeps cents * 100 exact near that limit.
  const remainders = split
    .map((b, index) => {
      b.percent = Number((BigInt(b.cents) * 100n) / BigInt(total));
      return { index, remainder: (BigInt(b.cents) * 100n) % BigInt(total) };
    })
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  const missing = 100 - split.reduce((sum, b) => sum + b.percent, 0);
  if (split.length)
    for (let i = 0; i < missing; i++) split[remainders[i].index].percent++;
  if (categories.length) categories[0].percent = split[0].percent;
  return { total, entries, categories, split };
}

const genericCaption = "Every entry has a story. This was my month.";
export function recapTitles(style: RecapStyle, recap: Recap) {
  if (style === "trading") {
    const generic = {
      id: "collected",
      title: "MONTH, COLLECTED.",
      caption: genericCaption,
    };
    if (recap.categories[0]?.id === "food")
      return [
        {
          id: "foodie",
          title: "CERTIFIED FOODIE.",
          caption: "Your money didn't disappear. You ate it.",
        },
        generic,
      ];
    if (recap.categories[0]?.id === "parking")
      return [
        {
          id: "parking",
          title: "PARKING REGULAR.",
          caption: "A little space. A place in the budget.",
        },
        generic,
      ];
    return [generic];
  }
  const generic = {
    id: "logged",
    title: "A MONTH. WELL LOGGED.",
    caption: genericCaption,
  };
  const top = recap.categories.slice(0, 2);
  if (
    top.length === 2 &&
    top.every((b) => (b.id === "food" || b.id === "parking") && b.share >= 0.1)
  ) {
    return [
      {
        id: "hungry_parked",
        title: "A LITTLE HUNGRY. A LOT PARKED.",
        caption: "Apparently, leaving the house is a subscription.",
      },
      generic,
    ];
  }
  return [generic];
}
