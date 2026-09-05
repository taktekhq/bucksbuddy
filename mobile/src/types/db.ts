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
  // Display-only: set when the row is shown obscured (this device is locked).
  // A garbled stand-in for the amount; the real value isn't available yet.
  amountMask?: string;
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

// A transaction row as it comes back from the database. The money *values* are
// encrypted per-column (`*_enc`); the labels stay plaintext. Legacy rows (not
// yet backfilled) still carry the plaintext `amount_usd_cents` / `original_amount`
// / `note`, which the drop migration removes later — hence optional. The store
// turns one of these into a decrypted `Transaction`.
export type TransactionRow = {
  id: string;
  user_id: string;
  occurred_at: string;
  created_at: string;
  is_income: boolean;
  category: string;
  original_currency: Currency;
  rate_used: number;
  amount_usd_cents_enc: string | null;
  original_amount_enc: string | null;
  note_enc: string | null;
  // Legacy plaintext, present until the drop migration runs.
  amount_usd_cents?: number | null;
  original_amount?: number | null;
  note?: string | null;
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
  // Display-only: garbled stand-in for grams when the device is locked.
  gramsMask?: string;
};

export type NewSafeGoldEntry = {
  is_deposit: boolean;
  grams: number;
  note?: string | null;
};

// A gold row as stored: `grams` and `note` are encrypted per-column; is_deposit
// stays plaintext. Legacy plaintext columns remain until the drop migration.
export type SafeGoldEntryRow = {
  id: string;
  user_id: string;
  occurred_at: string;
  created_at: string;
  is_deposit: boolean;
  grams_enc: string | null;
  note_enc: string | null;
  // Legacy plaintext, present until the drop migration runs.
  grams?: number | null;
  note?: string | null;
};
