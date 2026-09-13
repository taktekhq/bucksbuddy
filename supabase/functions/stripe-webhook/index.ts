// BucksBuddy: stripe-webhook edge function.
//
// The only place a review is allowed to become paid. Stripe is the authority on
// money, so the browser never tells us a payment succeeded — it only ever polls
// its own row and waits for this function to flip it.
//
// Three properties matter here, and each is implemented rather than assumed:
//   * AUTHENTICITY — the `Stripe-Signature` header is verified against the raw
//     request body with HMAC-SHA256, compared in constant time, and rejected if
//     the timestamp is older than the tolerance (so a captured request cannot be
//     replayed later).
//   * IDEMPOTENCY — Stripe retries, and can deliver out of order. Every event id
//     is claimed in `stripe_events` before it is applied; a duplicate is a no-op.
//     On top of that, each state change is a conditional UPDATE, so applying the
//     same transition twice changes nothing.
//   * NO SILENT LOSS — if the claim succeeds but applying it fails, the claim is
//     released and we answer 500, which asks Stripe to try again.
//
// Deploy (Supabase Dashboard → Edge Functions → Deploy a new function → Via
// Editor): name it exactly `stripe-webhook`, paste this file, Deploy, then turn
// "Verify JWT" OFF for this function — Stripe sends its own signature, not a
// Supabase token, and with JWT verification on every delivery would 401. Via
// CLI: `supabase functions deploy stripe-webhook --no-verify-jwt`.
//
// Then in Stripe → Developers → Webhooks → Add endpoint, point it at
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
// and subscribe to: checkout.session.completed,
// checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
// charge.refunded, charge.dispute.created. Copy the signing secret into the
// STRIPE_WEBHOOK_SECRET secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// #region verifiable — lifted out and exercised by scripts/verify-edge-functions.mjs
/** Reject anything signed more than this long ago (Stripe's own default). */
const TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent, value-independent comparison. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signaturesMatch(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  // "t=1699999999,v1=abc...,v1=def..." — more than one v1 appears while a
  // signing secret is being rotated, and any of them is good.
  const parts = header.split(",").map((p) => p.trim().split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const provided = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || provided.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  const expected = hex(new Uint8Array(mac));
  return provided.some((candidate) => constantTimeEqual(candidate, expected));
}
// #endregion verifiable

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("Not configured", { status: 500 });

  // The signature covers the bytes exactly as sent, so read the body as text
  // and never re-serialize it before verifying.
  const raw = await req.text();
  const header = req.headers.get("Stripe-Signature") ?? "";
  if (!(await signaturesMatch(raw, header, secret))) {
    return new Response("Bad signature", { status: 400 });
  }

  let event: {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  if (!event.id || !event.type) return new Response("Bad payload", { status: 400 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const object = event.data?.object ?? {};
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const reviewId =
    metadata.review_id ?? (object.client_reference_id as string | undefined) ?? null;

  // Claim the event first: the primary key makes a duplicate delivery a no-op.
  const { error: claimErr } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, review_id: reviewId });
  if (claimErr) {
    // Already applied (or unclaimable). Either way there is nothing to do, and
    // 200 stops Stripe retrying.
    return new Response("ok", { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        // A session can complete unpaid (a bank debit still clearing); only the
        // paid ones unlock a review.
        if (object.payment_status !== "paid") break;
        if (!reviewId) break;
        const paymentIntent =
          typeof object.payment_intent === "string" ? object.payment_intent : null;
        // Conditional on `pending`, so a replay — or a completion arriving after
        // a refund — cannot resurrect or re-pay a review.
        await admin
          .from("spending_reviews")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            payment_intent_id: paymentIntent,
          })
          .eq("id", reviewId)
          .eq("status", "pending");
        break;
      }
      case "checkout.session.async_payment_failed": {
        if (!reviewId) break;
        await admin
          .from("spending_reviews")
          .update({ status: "failed", error: "The payment did not go through." })
          .eq("id", reviewId)
          .eq("status", "pending");
        break;
      }
      case "charge.refunded":
      case "charge.dispute.created": {
        // Charge events carry no session, so they are matched by the review id
        // copied onto the PaymentIntent at checkout, and by payment intent id as
        // a fallback.
        const paymentIntent =
          typeof object.payment_intent === "string" ? object.payment_intent : null;
        const patch = { status: "refunded", refunded_at: new Date().toISOString() };
        if (reviewId) {
          await admin.from("spending_reviews").update(patch).eq("id", reviewId);
        } else if (paymentIntent) {
          await admin
            .from("spending_reviews")
            .update(patch)
            .eq("payment_intent_id", paymentIntent);
        }
        break;
      }
      default:
        // Subscribed to something new in the dashboard: recorded, ignored.
        break;
    }
  } catch (e) {
    // Release the claim so Stripe's retry gets a real attempt.
    await admin.from("stripe_events").delete().eq("id", event.id);
    return new Response(e instanceof Error ? e.message : "Error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
