// BucksBuddy: review-checkout edge function.
//
// Starts the purchase of one spending review. It is the gate, so it does the
// three things the browser cannot be trusted to do:
//   1. decides eligibility itself, by calling `report_eligibility` as the caller
//      (so row-level security scopes it) — the rule lives in the database, which
//      can also count every row the account has rather than the newest few
//      hundred the app keeps in memory;
//   2. writes the `spending_reviews` row with the service-role key, so status,
//      price and period are server-owned facts, not form fields;
//   3. asks Stripe for a Checkout Session and hands back only its URL.
//
// The browser sends the window it wants as timestamps because it is the only
// party that knows the user's local calendar months; we check the window is
// really one or three whole months and really in the past before quoting a price
// for it.
//
// Deploy (Supabase Dashboard → Edge Functions → Deploy a new function → Via
// Editor): name it exactly `review-checkout`, paste this file, Deploy. Keep
// "Verify JWT" ENABLED — the app sends the signed-in user's token. Or via CLI:
// `supabase functions deploy review-checkout`.
//
// Secrets to set (Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY   — Stripe → Developers → API keys → Secret key
//   APP_URL             — where the app is served, e.g. https://bucksbuddy.com
//   REVIEW_PRICE_CENTS  — optional, defaults to 500 ($5.00)
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by
// the platform.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Whole calendar months vary in length, and a three-month window crosses
// February. Rather than recompute the user's calendar here, accept a window
// whose length is only possible for the period they asked for.
const WINDOW_DAYS: Record<string, { min: number; max: number }> = {
  last_month: { min: 28, max: 31 },
  past_3_months: { min: 89, max: 92 },
};

// How many unpaid checkouts one account may leave lying around per hour. Stops
// a stuck client (or a bored one) from filling the table with pending rows.
const MAX_PENDING_PER_HOUR = 5;

const DAY_MS = 86_400_000;

type Body = {
  period_id?: unknown;
  period_from?: unknown;
  period_to?: unknown;
  home_currency?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const appUrl = Deno.env.get("APP_URL");
    if (!stripeKey || !appUrl) {
      return json({ error: "Payments are not configured yet." }, 500);
    }
    const priceCents = Number(Deno.env.get("REVIEW_PRICE_CENTS") ?? "500");
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      return json({ error: "Payments are not configured yet." }, 500);
    }

    // The caller's own client: identifies them, and runs the eligibility
    // function under their row-level security rather than ours.
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    // --- validate the requested window ---
    const body = (await req.json().catch(() => ({}))) as Body;
    const periodId = String(body.period_id ?? "");
    const window = WINDOW_DAYS[periodId];
    if (!window) return json({ error: "Unknown review period." }, 400);

    const from = new Date(String(body.period_from ?? ""));
    const to = new Date(String(body.period_to ?? ""));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return json({ error: "Bad review period." }, 400);
    }
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
    if (days < window.min || days > window.max) {
      return json({ error: "Bad review period." }, 400);
    }
    // A review only ever covers finished months, so the window must already be
    // over — with a day of slack for a clock that disagrees with ours.
    if (to.getTime() > Date.now() + DAY_MS) {
      return json({ error: "That period hasn't finished yet." }, 400);
    }
    const homeCurrency = String(body.home_currency ?? "");
    if (!/^[A-Z]{3}$/.test(homeCurrency)) {
      return json({ error: "Bad currency." }, 400);
    }

    // --- the gate ---
    const { data: facts, error: factsErr } = await caller.rpc("report_eligibility", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (factsErr) return json({ error: factsErr.message }, 500);
    if (!facts?.ok) {
      return json(
        { error: "This account isn't eligible for a review yet.", facts },
        403,
      );
    }

    const admin = createClient(url, serviceKey);

    // --- don't let pending rows pile up ---
    const { count: pending } = await admin
      .from("spending_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((pending ?? 0) >= MAX_PENDING_PER_HOUR) {
      return json(
        { error: "Too many checkouts started just now. Try again shortly." },
        429,
      );
    }

    // --- the row is created before the payment exists, and owns the facts ---
    const { data: review, error: insertErr } = await admin
      .from("spending_reviews")
      .insert({
        user_id: user.id,
        status: "pending",
        period_id: periodId,
        period_from: from.toISOString(),
        period_to: to.toISOString(),
        home_currency: homeCurrency,
        price_cents: priceCents,
        price_currency: "usd",
      })
      .select("id")
      .single();
    if (insertErr || !review) {
      return json({ error: insertErr?.message ?? "Could not start checkout." }, 500);
    }

    // --- Stripe Checkout, hosted: a plain redirect, so the app needs no
    // third-party script and no new Content-Security-Policy entry. ---
    const form = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(priceCents),
      "line_items[0][price_data][product_data][name]": "BucksBuddy spending review",
      "line_items[0][price_data][product_data][description]":
        "One AI-written review of your logged spending.",
      // The app is hash-routed, so the review id rides in the query string
      // where the router won't trip over it.
      success_url: `${appUrl}/?review=${review.id}#/review`,
      cancel_url: `${appUrl}/?review=${review.id}&cancelled=1#/review`,
      client_reference_id: review.id,
      "metadata[review_id]": review.id,
      "metadata[user_id]": user.id,
      // Copied onto the PaymentIntent so a later refund or dispute webhook,
      // which only carries charge data, can still find this review.
      "payment_intent_data[metadata][review_id]": review.id,
    });
    if (user.email) form.set("customer_email", user.email);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // One session per review row, so a retried request cannot charge twice.
        "Idempotency-Key": `review-${review.id}`,
      },
      body: form,
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok || !session?.url) {
      // Record why, but LEAVE THE STATUS ALONE. We cannot be certain no session
      // was created, and the webhook only promotes a row that is still
      // `pending` — marking this failed would make a payment that did land
      // unclaimable.
      await admin
        .from("spending_reviews")
        .update({ error: session?.error?.message ?? "Stripe error" })
        .eq("id", review.id);
      return json({ error: "Could not reach the payment page." }, 502);
    }

    await admin
      .from("spending_reviews")
      .update({ checkout_session_id: session.id })
      .eq("id", review.id);

    return json({ review_id: review.id, url: session.url }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
