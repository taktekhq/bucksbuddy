// The data layer for paid spending reviews. Pure data — no React.
//
// Three of these calls go to edge functions rather than to a table, because the
// browser is not allowed to decide them: whether an account may buy a review,
// whether one has been paid for, and what the model writes. See
// supabase/functions/review-checkout, stripe-webhook and generate-review, and
// migration 0009 for the row-level security that backs it up — the only column
// the browser may write on a review is the encrypted body, because it is the
// only party holding the key.

import { supabase } from "@/lib/supabase";
import type { Currency } from "@/lib/currency";
import { formatCents } from "@/lib/money";
import { reportPeriodBounds, type ReportPeriodId } from "@/lib/reportPeriod";
import type { SpendingDigest } from "@/lib/reportDigest";
import { MIN_SPEND_ENTRIES, type ReportFacts } from "@/lib/reportEligibility";
import type { SpendingReview, SpendingReviewRow } from "@/types/db";

// What a review costs, for the offer copy. The charge itself is set by the
// `REVIEW_PRICE_CENTS` secret on the review-checkout function (default 500) —
// change one and change the other. A bought review always shows the price it was
// actually charged, from its own row, so the archive can never be wrong.
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
  const { from, to } = reportPeriodBounds(periodId, now);
  const { data, error } = await supabase.rpc("report_eligibility", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
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

/** Every review this account has bought, newest first. */
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

/** One review, for polling a checkout back from Stripe. */
export async function fetchReview(id: string): Promise<SpendingReviewRow | null> {
  const { data } = await supabase
    .from("spending_reviews")
    .select(ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as SpendingReviewRow | null) ?? null;
}

/**
 * Start a purchase. Returns Stripe's hosted checkout URL to navigate to — a
 * plain redirect, so no third-party script runs in the app.
 *
 * The window is computed here, from the user's local calendar, and the function
 * checks it really is one or three finished months before quoting a price.
 */
export async function startCheckout(
  periodId: ReportPeriodId,
  homeCurrency: Currency,
  now = new Date(),
): Promise<{ url: string | null; error: string | null }> {
  const { from, to } = reportPeriodBounds(periodId, now);
  const { data, error } = await invoke<{ url: string; review_id: string }>(
    "review-checkout",
    {
      period_id: periodId,
      period_from: from.toISOString(),
      period_to: to.toISOString(),
      home_currency: homeCurrency,
    },
  );
  if (error) return { url: null, error };
  return { url: data?.url ?? null, error: null };
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

/**
 * Validate a review, whether it came from the edge function or out of the
 * database and through decryption. Anything unexpected reads as "not a review"
 * rather than rendering half a screen of undefined.
 */
export function asSpendingReview(value: unknown): SpendingReview | null {
  const r = value as Partial<SpendingReview> | null;
  if (
    typeof r?.title !== "string" ||
    typeof r.summary !== "string" ||
    !Array.isArray(r.sections) ||
    !isStringArray(r.notables) ||
    !isStringArray(r.caveats)
  ) {
    return null;
  }
  const sections = [];
  for (const section of r.sections) {
    if (
      typeof section?.heading !== "string" ||
      typeof section.body !== "string" ||
      !Array.isArray(section.figures)
    ) {
      return null;
    }
    const figures = [];
    for (const figure of section.figures) {
      if (typeof figure?.label !== "string" || typeof figure.value !== "string") {
        return null;
      }
      figures.push({ label: figure.label, value: figure.value });
    }
    sections.push({
      heading: section.heading,
      body: section.body,
      figures,
    });
  }
  return {
    title: r.title,
    summary: r.summary,
    sections,
    notables: r.notables,
    caveats: r.caveats,
  };
}

/** "$5.00" — what a review row was actually charged. */
export function reviewPrice(row: SpendingReviewRow): string {
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
