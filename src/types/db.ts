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

// --- v2: what Dad made of it ---
//
// A review is a list of short findings, not an essay. The model's only real
// value is judgement — what is going right, what to hold down, what is worth
// re-pricing — and prose buried that under paragraphs nobody reads. The numbers
// are the device's job and are charted beside this by ReviewBreakdown.
//
// THE DIGITS ALL LIVE IN ONE PLACE, and that is a safety property rather than a
// style: `evidence[].value` is the only field allowed to contain a numeral, and
// each one must be a character-for-character copy of a `display` string from the
// digest. That turns the numbers guarantee from a regex scan over prose — which
// could never see "up 30%" or "three times" — into exact set membership. The
// generating function rejects a draft with a digit anywhere else.
export type ReviewFindingKind = "good" | "improve" | "swap";

export type ReviewFinding = {
  /**
   * Which bucket: `good`, `improve` or `swap`. Typed as a plain string on
   * purpose — the PWA auto-updates but an installed copy can still be a version
   * behind the server, so a kind this build has never heard of must render in a
   * neutral bucket rather than make the whole review unopenable.
   */
  kind: string;
  /**
   * What the judgement stands on. `"logged"` is all there is today; the field
   * exists now so that a goals-aware server can emit `"goal"` later without a
   * migration — a review body is one opaque encrypted string, so the only
   * compatibility surface is this validator.
   */
  basis: string;
  /** The claim, one line. Contains no digits. */
  title: string;
  /** One or two short sentences of reasoning. Contains no digits. */
  detail: string;
  /** Zero to two figures, each copied verbatim from the digest. */
  evidence: ReviewFigure[];
  /**
   * Which line of the ledger this is about — a category, subcategory or month
   * label copied from the digest — or null for a finding about the whole
   * window.
   */
  category: string | null;
};

export type ReviewFindings = {
  version: 2;
  /** One line: the period's verdict. */
  headline: string;
  /**
   * The direction of travel in this reader's OWN record. Never a comparison
   * with anyone else — there is no benchmark in the digest to make one from.
   * A plain string for the same forward-compatibility reason as `kind`.
   */
  standing: string;
  findings: ReviewFinding[];
  /** What this review could not see. */
  blindSpots: string[];
};

// --- v1: the prose reviews already stored ---
//
// Superseded, and still opened: a review bought before the redesign is the
// reader's, and it renders as it was written. Nothing generates this shape now.
export type ReviewSection = {
  heading: string;
  body: string;
  figures: ReviewFigure[];
};
export type ReviewProse = {
  version: 1;
  title: string;
  summary: string;
  sections: ReviewSection[];
  notables: string[];
  caveats: string[];
};

/**
 * Either shape. Discriminated on `version`, which v1 rows do not carry on disk
 * — `asSpendingReview` puts it there on the way in, from which fields are
 * present. Nothing writes the discriminant back: the only time a review is
 * stored is right after it is generated, and that is always the current shape.
 */
export type SpendingReview = ReviewFindings | ReviewProse;
