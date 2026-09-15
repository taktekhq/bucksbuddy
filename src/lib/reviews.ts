// The data layer for spending reviews. Pure data — no React.
//
// Three of these calls go to edge functions rather than to a table, because the
// browser is not allowed to decide them: whether an account may have a review,
// whether one has been paid for, and what the model writes. See
// supabase/functions/review-start, stripe-webhook and generate-review, and
// migration 0009 for the row-level security that backs it up — the only column
// the browser may write on a review is the encrypted body, because it is the
// only party holding the key.

import { supabase } from "@/lib/supabase";
import type { Currency } from "@/lib/currency";
import { formatCents } from "@/lib/money";
import {
  eligibilityFrom,
  reportPeriodBounds,
  type ReportPeriodId,
} from "@/lib/reportPeriod";
import type { SpendingDigest } from "@/lib/reportDigest";
import { MIN_SPEND_ENTRIES, type ReportFacts } from "@/lib/reportEligibility";
import type {
  ReviewFinding,
  ReviewFindings,
  ReviewFigure,
  ReviewProse,
  ReviewSection,
  SpendingReview,
  SpendingReviewRow,
} from "@/types/db";

// Whether this build advertises a price. It governs COPY ONLY — the server is
// the sole authority on whether a review is free, charged, or refused (see the
// review-start function). Set it to "stripe" when you turn payments on, and keep
// `REVIEW_PRICE_CENTS` in step with the function's secret of the same name. A
// review already bought always shows the price it was actually charged, from its
// own row, so the archive can never be wrong whatever this says.
export const REVIEW_BILLING: "off" | "stripe" = "off";

// What a review costs once billing is on, for the offer copy.
export const REVIEW_PRICE_CENTS = 500;

/** "$5.00" — the advertised price. */
export function reviewPriceLabel(): string {
  return formatCents(REVIEW_PRICE_CENTS, "USD");
}

const ROW_COLUMNS =
  "id, status, period_id, period_from, period_to, home_currency, price_cents, price_currency, paid_at, refunded_at, body_enc, attempts, error, created_at";

/**
 * Call an edge function and surface the message it wrote for the user.
 *
 * A non-2xx reply arrives as an error whose `context` is the raw Response, so
 * the function's own `{ error }` body — "you need 40 expenses", "that review
 * used up its attempts" — is in there. Without this the user would only ever see
 * the SDK's generic "non-2xx status code".
 */
async function invoke<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { data: data as T, error: null };
  const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
  if (context?.json) {
    try {
      const payload = (await context.json()) as { error?: unknown };
      if (typeof payload?.error === "string") {
        return { data: null, error: payload.error };
      }
    } catch {
      // Not JSON (a gateway error page, say) — fall back to the SDK's message.
    }
  }
  return { data: null, error: error.message };
}

/**
 * Where this account stands against the bar, counted by the database over every
 * row it has. A missing `report_eligibility` function means migration 0009 has
 * not been applied yet; the error is passed through so the screen can say so
 * instead of pretending nobody qualifies.
 */
export async function fetchEligibility(
  periodId: ReportPeriodId,
  now = new Date(),
): Promise<{ facts: ReportFacts | null; error: string | null }> {
  // Null for "all time": only the database knows when this account's logging
  // started, and it anchors the window there (migration 0011).
  const { data, error } = await supabase.rpc("report_eligibility", {
    p_from: eligibilityFrom(periodId, now),
    p_to: now.toISOString(),
  });
  if (error) return { facts: null, error: error.message };
  const facts = (data as ReportFacts | null) ?? null;
  if (facts === null) return { facts: null, error: null };
  // The threshold is echoed by the database so the copy can quote what was
  // actually applied. A deployment running an older function would not send it,
  // and an undefined threshold makes every comparison against it false — which
  // would drop the blocker instead of showing it.
  return {
    facts: { ...facts, minSpendEntries: facts.minSpendEntries ?? MIN_SPEND_ENTRIES },
    error: null,
  };
}

/** Every review this account has, newest first. */
export async function listReviews(): Promise<{
  reviews: SpendingReviewRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("spending_reviews")
    .select(ROW_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) return { reviews: [], error: error.message };
  return { reviews: (data ?? []) as SpendingReviewRow[], error: null };
}

/** One review by id: the row a free grant just created, or a Stripe return. */
export async function fetchReview(id: string): Promise<SpendingReviewRow | null> {
  const { data } = await supabase
    .from("spending_reviews")
    .select(ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as SpendingReviewRow | null) ?? null;
}

/**
 * Ask the server to authorise one review. It decides how, and it is the only
 * party that may:
 *
 *   * `free: true` with a review id — this account is on the allowlist, the row
 *     is already paid at a price of 0, and the browser may generate it now.
 *   * a `url` — a Stripe hosted checkout to navigate to. A plain redirect, so no
 *     third-party script runs in the app.
 *   * an error — not eligible, or the feature is not open to this account.
 *
 * The window is computed here, from the user's local calendar, because only this
 * side knows it; the function checks it really is one or three finished months.
 */
export async function startReview(
  periodId: ReportPeriodId,
  homeCurrency: Currency,
  firstEntryAt: string | null = null,
  now = new Date(),
): Promise<{
  reviewId: string | null;
  url: string | null;
  free: boolean;
  error: string | null;
}> {
  // `firstEntryAt` only matters for "all time", and by the time this can be
  // called the eligibility answer that carries it has already landed — the
  // button is disabled until it does.
  const { from, to } = reportPeriodBounds(periodId, now, firstEntryAt);
  const { data, error } = await invoke<{
    url?: string;
    review_id: string;
    free?: boolean;
  }>("review-start", {
    period_id: periodId,
    period_from: from.toISOString(),
    period_to: to.toISOString(),
    home_currency: homeCurrency,
  });
  if (error) return { reviewId: null, url: null, free: false, error };
  return {
    reviewId: data?.review_id ?? null,
    url: data?.url ?? null,
    free: data?.free === true,
    error: null,
  };
}

/** Ask for the review to be written. The digest is computed on this device. */
export async function generateReview(
  reviewId: string,
  digest: SpendingDigest,
): Promise<{ review: SpendingReview | null; error: string | null }> {
  const { data, error } = await invoke<{ review: unknown }>("generate-review", {
    review_id: reviewId,
    digest,
  });
  if (error) return { review: null, error };
  const review = asSpendingReview(data?.review);
  if (!review) {
    return { review: null, error: "That review came back unreadable." };
  }
  return { review, error: null };
}

/** Store the sealed review. The only column the browser may write. */
export async function storeReviewBody(
  id: string,
  bodyEnc: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("spending_reviews")
    .update({ body_enc: bodyEnc })
    .eq("id", id);
  return { error: error?.message ?? null };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** One `{ label, value }` pair, or null if it is not one. */
function asFigure(value: unknown): ReviewFigure | null {
  const f = value as Partial<ReviewFigure> | null;
  if (typeof f?.label !== "string" || typeof f.value !== "string") return null;
  return { label: f.label, value: f.value };
}

/** A list of them, or null if any entry is not one. */
function asFigures(value: unknown): ReviewFigure[] | null {
  if (!Array.isArray(value)) return null;
  const out: ReviewFigure[] = [];
  for (const raw of value) {
    const figure = asFigure(raw);
    if (figure === null) return null;
    out.push(figure);
  }
  return out;
}

/**
 * One finding, or null if it is structurally not one.
 *
 * FORWARD-TOLERANT ON PURPOSE. `kind` and `basis` are taken as whatever strings
 * they are, and unknown properties are ignored rather than refused, because an
 * installed copy of this app can be a version behind the function that wrote
 * the review it is opening — the service worker updates on its own schedule
 * (registerType: "autoUpdate"). A finding whose kind this build does not
 * recognise renders in a neutral bucket; refusing it would put "that review
 * couldn't be opened on this device" on screen for a review that is perfectly
 * fine and already paid for. Only a missing or wrong-typed required field is
 * fatal.
 */
function asFinding(value: unknown): ReviewFinding | null {
  const f = value as Record<string, unknown> | null;
  if (
    !f ||
    typeof f.kind !== "string" ||
    typeof f.title !== "string" ||
    typeof f.detail !== "string"
  ) {
    return null;
  }
  const evidence = asFigures(f.evidence);
  if (evidence === null) return null;
  return {
    kind: f.kind,
    // Absent on nothing today, and the field exists for a server this build has
    // not met yet — so a missing one is a default, not a failure.
    basis: typeof f.basis === "string" ? f.basis : "logged",
    title: f.title,
    detail: f.detail,
    evidence,
    category: typeof f.category === "string" ? f.category : null,
  };
}

/**
 * Validate a review, whether it came from the edge function or out of the
 * database and through decryption. Anything structurally unexpected reads as
 * "not a review" rather than rendering half a screen of undefined.
 *
 * TWO shapes are accepted, and which one this is comes from the fields rather
 * than from a stored version number: reviews written before the redesign are
 * prose and carry no version at all, so a `findings` array is what says this is
 * the current shape. The discriminant is added here; it is never stored.
 */
export function asSpendingReview(value: unknown): SpendingReview | null {
  const r = value as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  return "findings" in r ? asFindings(r) : asProse(r);
}

function asFindings(r: Record<string, unknown>): ReviewFindings | null {
  if (
    typeof r.headline !== "string" ||
    !Array.isArray(r.findings) ||
    !isStringArray(r.blindSpots)
  ) {
    return null;
  }
  const findings: ReviewFinding[] = [];
  for (const raw of r.findings) {
    const finding = asFinding(raw);
    if (finding === null) return null;
    findings.push(finding);
  }
  return {
    version: 2,
    headline: r.headline,
    // A verdict this build does not recognise is still a verdict; only a
    // non-string is a shape failure, and an absent one is "no direction".
    standing: typeof r.standing === "string" ? r.standing : "unclear",
    findings,
    blindSpots: r.blindSpots,
  };
}

function asProse(r: Record<string, unknown>): ReviewProse | null {
  if (
    typeof r.title !== "string" ||
    typeof r.summary !== "string" ||
    !Array.isArray(r.sections) ||
    !isStringArray(r.notables) ||
    !isStringArray(r.caveats)
  ) {
    return null;
  }
  const sections: ReviewSection[] = [];
  for (const raw of r.sections) {
    const section = raw as Record<string, unknown> | null;
    if (typeof section?.heading !== "string" || typeof section.body !== "string") {
      return null;
    }
    const figures = asFigures(section.figures);
    if (figures === null) return null;
    sections.push({ heading: section.heading, body: section.body, figures });
  }
  return {
    version: 1,
    title: r.title,
    summary: r.summary,
    sections,
    notables: r.notables,
    caveats: r.caveats,
  };
}

/** What a review row actually cost: "$5.00", or "Free" when nobody paid. */
export function reviewPrice(row: SpendingReviewRow): string {
  if (row.price_cents === 0) return "Free";
  return formatCents(row.price_cents, row.price_currency.toUpperCase());
}

/**
 * Wait for Stripe's webhook to land after a return from checkout.
 *
 * The browser is never told a payment succeeded — it watches its own row until
 * the webhook flips it. `sleep` and `read` are injectable so this is testable
 * without timers.
 */
export async function waitForPaidReview(
  id: string,
  {
    attempts = 15,
    delayMs = 2000,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    read = fetchReview,
  }: {
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    read?: (id: string) => Promise<SpendingReviewRow | null>;
  } = {},
): Promise<SpendingReviewRow | null> {
  let row = await read(id);
  for (let i = 1; i < attempts && row?.status === "pending"; i++) {
    await sleep(delayMs);
    row = await read(id);
  }
  return row;
}
