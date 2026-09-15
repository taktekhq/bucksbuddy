import type { Currency, CurrencyRate } from "@/lib/currency";

// `amount_usd_cents` is the amount normalized to the user's HOME currency, in
// hundredths. The column name is historical — USD was the only home currency
// when it was created — and renaming an encrypted column buys nothing, so it
// stays; read it as "home cents". `original_currency` / `original_amount` are
// what was actually typed, and `rate_used` the rate that turned it into home
// cents (units of original per 1 home; 1 for an entry in the home currency).
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
  home_currency: Currency;
  // The secondary currencies, each with its rate per 1 home unit (jsonb).
  currencies: CurrencyRate[];
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

// --- paid spending reviews (see lib/reviews, migration 0009) ---

// pending  — checkout started, money not confirmed
// paid     — Stripe confirmed it; the review may be generated
// ready    — the model wrote it (the body may not have reached us yet)
// failed   — generation gave up, or the payment didn't complete
// refunded — money returned
export type ReviewStatus = "pending" | "paid" | "ready" | "failed" | "refunded";

// A review row as stored. Only `body_enc` is encrypted — with the account's
// master key, like every amount — and only the browser can write it.
export type SpendingReviewRow = {
  id: string;
  status: ReviewStatus;
  period_id: string;
  period_from: string;
  period_to: string;
  home_currency: Currency;
  price_cents: number;
  price_currency: string;
  paid_at: string | null;
  refunded_at: string | null;
  body_enc: string | null;
  attempts: number;
  error: string | null;
  created_at: string;
};

// The written review itself, as the generating function returns it and as it is
// stored (encrypted) in `body_enc`. Rendered field by field — never as markup.
export type ReviewFigure = { label: string; value: string };
export type ReviewSection = {
  heading: string;
  body: string;
  figures: ReviewFigure[];
};
export type SpendingReview = {
  title: string;
  summary: string;
  sections: ReviewSection[];
  notables: string[];
  caveats: string[];
};
