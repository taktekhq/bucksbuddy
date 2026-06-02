import type { Currency } from "@/lib/currency";

export type Transaction = {
  id: string;
  user_id: string;
  is_income: boolean;
  category: string;
  amount_usd_cents: number;
  original_currency: Currency;
  original_amount: number;
  rate_used: number;
  occurred_at: string;
  note: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  lbp_per_usd: number;
  created_at: string;
  updated_at: string;
};

// Payload for inserting a new transaction (user_id set server-side via auth).
export type NewTransaction = {
  is_income: boolean;
  category: string;
  amount_usd_cents: number;
  original_currency: Currency;
  original_amount: number;
  rate_used: number;
  note?: string | null;
  // Normally defaulted server-side to now(). We set it explicitly only to pair
  // an "existing savings" income with its Safe deposit (same timestamp).
  occurred_at?: string;
};

// Cash in the Safe is not its own table: it's recorded as normal transactions
// with the "safe" category (see lib/categories), so moving money to/from the
// safe shows in history and moves your balance.

// Gold in the Safe, tracked purely in grams (no stored conversion). The safe's
// gold total is the all-time signed sum of grams.
export type SafeGoldEntry = {
  id: string;
  user_id: string;
  is_deposit: boolean;
  grams: number;
  note: string | null;
  occurred_at: string;
  created_at: string;
};

export type NewSafeGoldEntry = {
  is_deposit: boolean;
  grams: number;
  note?: string | null;
};
