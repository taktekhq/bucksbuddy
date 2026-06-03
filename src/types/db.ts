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

// A transaction row as it comes back from the database. With E2E encryption the
// sensitive columns are null and the values live in `ciphertext` instead;
// legacy (pre-encryption) rows still carry the plaintext columns and no
// ciphertext. The store turns one of these into a decrypted `Transaction`.
export type TransactionRow = {
  id: string;
  user_id: string;
  occurred_at: string;
  created_at: string;
  ciphertext: string | null;
  is_income: boolean | null;
  category: string | null;
  amount_usd_cents: number | null;
  original_currency: Currency | null;
  original_amount: number | null;
  rate_used: number | null;
  note: string | null;
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

// A gold row as stored: like SafeGoldEntry but, once encrypted, the sensitive
// columns are null and the values live in `ciphertext`. Legacy rows still carry
// the plaintext columns and no ciphertext.
export type SafeGoldEntryRow = {
  id: string;
  user_id: string;
  occurred_at: string;
  created_at: string;
  ciphertext: string | null;
  is_deposit: boolean | null;
  grams: number | null;
  note: string | null;
};
