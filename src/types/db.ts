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
};

// A single movement in the savings Safe. is_deposit true = money added to the
// safe, false = money taken out. The safe total is the all-time signed sum.
export type SafeEntry = {
  id: string;
  user_id: string;
  is_deposit: boolean;
  amount_usd_cents: number;
  original_currency: Currency;
  original_amount: number;
  rate_used: number;
  note: string | null;
  occurred_at: string;
  created_at: string;
};

export type NewSafeEntry = {
  is_deposit: boolean;
  amount_usd_cents: number;
  original_currency: Currency;
  original_amount: number;
  rate_used: number;
  note?: string | null;
};
