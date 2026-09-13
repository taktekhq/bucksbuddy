// Fictional months for the preview. Every name and number here is made up.
import type { Transaction } from "@/types/db";

export type Fixture = {
  id: string;
  rows: () => Transaction[];
  key: string; // "YYYY-MM"
  currency: string;
  name?: string;
  amounts?: boolean;
  noCaption?: boolean;
};

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();
let n = 0;
export function tx(category: string, cents: number, y: number, m: number, d: number, h = 12, extra: Partial<Transaction> = {}): Transaction {
  n += 1;
  return {
    id: `t${n}`, user_id: "u", is_income: false, category, amount_usd_cents: cents,
    original_currency: "USD", original_amount: cents / 100, rate_used: 1,
    occurred_at: at(y, m, d, h), note: null, created_at: at(y, m, d, h), ...extra,
  };
}

// September 2026: a foodie month with deliveries, logged 22 of 30 days.
export function foodMonth(): Transaction[] {
  const rows: Transaction[] = [];
  for (let d = 1; d <= 30; d++) {
    if ([3, 7, 11, 14, 19, 22, 25, 28].includes(d)) continue;
    rows.push(tx(d % 2 ? "food/delivery" : "food/restaurant", 1000 + d * 7, 2026, 8, d, 13));
  }
  rows.push(tx("groceries/supermarket", 15000, 2026, 8, 2), tx("groceries", 4200, 2026, 8, 9));
  rows.push(tx("parking", 11400, 2026, 8, 5), tx("fun/drinks", 5400, 2026, 8, 12), tx("fun/movies", 5400, 2026, 8, 20));
  rows.push(tx("coffee/cafe", 450, 2026, 8, 1, 8), tx("coffee/cafe", 450, 2026, 8, 4, 8), tx("gas", 6000, 2026, 8, 6));
  rows.push(tx("salary", 300000, 2026, 8, 1, 9, { is_income: true }));
  return rows;
}

// A coffee-heavy, sparse month: 5 days logged of 31 → common.
export function coffeeMonth(): Transaction[] {
  return [
    tx("coffee/cafe", 480, 2026, 6, 2, 8), tx("coffee/cafe", 520, 2026, 6, 3, 8), tx("coffee/beans", 1800, 2026, 6, 10, 18),
    tx("coffee/cafe", 480, 2026, 6, 11, 8), tx("food/snacks", 300, 2026, 6, 20, 23), tx("coffee/cafe", 480, 2026, 6, 20, 8),
  ];
}

// Every day logged in Feb 2026 (28 days), LBP home currency, huge numbers, many categories.
export function legendaryMonth(): Transaction[] {
  const cats = ["parking", "gas", "transport/taxi", "fees/subscriptions", "rent", "health/pharmacy", "gym", "shopping/clothes", "self_care/nails", "gifts", "tips", "work", "family", "other", "coffee/cafe", "food/restaurant", "groceries", "fun/events"];
  const rows: Transaction[] = [];
  for (let d = 1; d <= 28; d++) {
    rows.push(tx(cats[d % cats.length], 900000 * (1 + (d % 5)), 2026, 1, d, 20 + (d % 4), { original_currency: "LBP", original_amount: 9000000, rate_used: 89500 }));
    if (d % 3 === 0) rows.push(tx("parking", 1500000, 2026, 1, d, 9, { original_currency: "LBP", original_amount: 1500000, rate_used: 89500 }));
  }
  rows.push(tx("rent", 60000000, 2026, 1, 1, 10, { original_currency: "LBP" }));
  return rows;
}

// Weekend-heavy dual type (food vs coffee nearly level), two currencies, 14-day streak.
export function weekendMonth(): Transaction[] {
  const rows: Transaction[] = [];
  for (let d = 1; d <= 14; d++) rows.push(tx("coffee/cafe", 1200, 2026, 7, d, 8, { original_currency: d % 2 ? "USD" : "LBP" }));
  // Aug 2026 weekends: 1,2,8,9,15,16,22,23,29,30
  for (const d of [1, 2, 8, 9, 15, 16, 22, 23, 29, 30]) rows.push(tx("food/restaurant", 2000, 2026, 7, d, 21));
  rows.push(tx("fun/events", 4000, 2026, 7, 22, 20), tx("fun/events", 4000, 2026, 7, 29, 20));
  return rows;
}
