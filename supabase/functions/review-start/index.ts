// BucksBuddy: review-start edge function.
//
// Authorises one spending review. It is the gate, so it does the three things
// the browser cannot be trusted to do:
//   1. decides eligibility itself, by calling `report_eligibility` as the caller
//      (so row-level security scopes it) — the rule lives in the database, which
//      can also count every row the account has rather than the newest few
//      hundred the app keeps in memory;
//   2. writes the `spending_reviews` row with the service-role key, so status,
//      price and period are server-owned facts, not form fields;
//   3. decides HOW the review is paid for, and is the only party that may.
//
// There are two ways a review gets authorised, in this order:
//
//   ALLOWLIST — an account named in REVIEW_ALLOWLIST gets one free, marked paid
//   at a price of 0 with no payment involved. This is how the feature runs while
//   it is being tried out: no Stripe, no charge, and nobody else can reach it.
//
//   STRIPE — anyone else, once STRIPE_SECRET_KEY and APP_URL are set: the normal
//   Checkout Session, whose URL is handed back for the browser to navigate to.
//
// With neither an allowlist entry nor Stripe configured, the answer is a plain
// 403: the feature exists but is not open. That is deliberately the default, so
// deploying this function does not by itself sell anything.
//
// The browser sends the window it wants as timestamps because it is the only
// party that knows the user's local calendar months. What this function checks
// about it: that its span is plausible for the period asked for (a sanity bound,
// no longer an identification — two of the windows end at the moment they are
// asked for, so their length depends on the date), that it does not reach into
// the future, and — for an all-time window — that it really starts where this
// account's logging started.
//
// Deploy (Supabase Dashboard → Edge Functions → Deploy a new function → Via
// Editor): name it exactly `review-start`, paste this file, Deploy. Keep
// "Verify JWT" ENABLED — the app sends the signed-in user's token. Or via CLI:
// `supabase functions deploy review-start`.
//
// Secrets to set (Dashboard → Edge Functions → Secrets):
//   REVIEW_ALLOWLIST    — comma-separated emails and/or auth user ids that get
//                         reviews free. Leave unset to allow nobody.
//   STRIPE_SECRET_KEY   — only when you want to charge. Stripe → Developers →
//                         API keys → Secret key
//   APP_URL             — only needed with Stripe: where the app is served,
//                         e.g. https://bucksbuddy.com
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

// The client computes the window from the user's own local calendar, which this
// function cannot see. Both windows on offer are CLAMPED to the account's first
// entry, so their length is whatever the account's history is — a length
// whitelist could no longer identify either one. What is checked instead:
//
//   * the span does not exceed what the review could possibly cover (below),
//   * the window does not reach into the future,
//   * it does not start before the account did (verified against the account's
//     real first entry, further down).
//
// The recent review reaches three whole months back plus the elapsed part of
// this one: at most 31+31+31+31 = 124 days, and a couple of days of slack for a
// timezone offset. All time is whatever the history is, so its bound is a sanity
// check rather than a rule. The superseded ids keep their original bands, for a
// client that has not reloaded yet.
const MAX_WINDOW_DAYS: Record<string, number> = {
  last_3_months: 126,
  all_time: 20_000,
  this_vs_last: 63,
  last_month: 31,
  past_3_months: 92,
};

// Reviews one account may have per calendar month (UTC).
//
// ONE for a paying customer, which is what "no more than $5 a month" means with
// a $5 review. TEN for an allowlisted account, where the constraint is not money
// but the owner's own model quota: the cap is there so a stuck client cannot
// mint reviews in a loop, and a tester needs room to iterate.
const REVIEWS_PER_MONTH = { free: 10, paid: 1 };

// How many unpaid checkouts one account may leave lying around per hour. Stops
// a stuck client (or a bored one) from filling the table with pending rows.
const MAX_PENDING_PER_HOUR = 5;

/**
 * Is this account on the free list? Matched on email OR auth user id, so it can
 * be set before knowing either, and compared case-insensitively because an email
 * typed into a dashboard field rarely matches the case Supabase stored.
 */
function isAllowlisted(email: string | undefined, userId: string): boolean {
  const raw = Deno.env.get("REVIEW_ALLOWLIST") ?? "";
  const entries = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
  if (entries.length === 0) return false;
  return (
    entries.includes(userId.toLowerCase()) ||
    (email !== undefined && entries.includes(email.toLowerCase()))
  );
}

const DAY_MS = 86_400_000;

/** The current UTC calendar month, and the day the next one starts. */
function monthBounds(now: Date): { start: string; nextLabel: string } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return {
    start: start.toISOString(),
    nextLabel: next.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }),
  };
}

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
    // Validated in the paid branch below, not here: a price is meaningless to a
    // free grant, and rejecting one up front would let a misconfigured secret
    // (REVIEW_PRICE_CENTS set to 0, or saved empty) 500 the route that charges
    // nobody anything.
    const priceCents = Number(Deno.env.get("REVIEW_PRICE_CENTS") ?? "500");

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
    const maxDays = MAX_WINDOW_DAYS[periodId];
    if (maxDays === undefined) {
      return json({ error: "Unknown review period." }, 400);
    }

    const from = new Date(String(body.period_from ?? ""));
    const to = new Date(String(body.period_to ?? ""));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return json({ error: "Bad review period." }, 400);
    }
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
    if (days > maxDays) return json({ error: "Bad review period." }, 400);
    // Two of the windows end now, so "finished" is not the rule — but a window
    // reaching into the future is still nonsense. A day of slack absorbs a clock
    // that disagrees with ours.
    if (to.getTime() > Date.now() + DAY_MS) {
      return json({ error: "That period hasn't happened yet." }, 400);
    }
    if (from.getTime() >= to.getTime()) {
      return json({ error: "Bad review period." }, 400);
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

    // Neither window may start before the account did, and eligibility was
    // counted from the same anchor — `facts.firstEntryAt` is the account's real
    // first entry, whoever asked. A day of slack for the timezone the client
    // computed in. All time has to start AT it; the recent review may start
    // later (it reaches three months back at most) but never earlier.
    const firstEntry = Date.parse(String(facts.firstEntryAt ?? ""));
    if (Number.isNaN(firstEntry)) {
      return json({ error: "Nothing logged yet." }, 403);
    }
    if (from.getTime() < firstEntry - DAY_MS) {
      return json({ error: "Bad review period." }, 400);
    }
    if (
      periodId === "all_time" &&
      Math.abs(from.getTime() - firstEntry) > DAY_MS
    ) {
      return json({ error: "Bad review period." }, 400);
    }

    const admin = createClient(url, serviceKey);

    const free = isAllowlisted(user.email, user.id);

    // --- don't let pending rows pile up ---
    // Only the paying route can leave one behind, so a free review skips this
    // entirely rather than being held up by a queue it cannot join.
    //
    // postgrest returns a failure as `{ error, count: null }` rather than
    // throwing, and a null count coalesced to 0 would switch this limit off
    // exactly when the database is struggling. Fail closed instead.
    const countPending = async () =>
      await admin
        .from("spending_reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending")
        .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());

    const { count: pending, error: countErr } = free
      ? { count: 0, error: null }
      : await countPending();
    if (countErr || pending === null) {
      return json({ error: "Could not start a review. Try again shortly." }, 503);
    }
    if (pending >= MAX_PENDING_PER_HOUR) {
      return json(
        { error: "Too many checkouts started just now. Try again shortly." },
        429,
      );
    }

    // --- one review a month ---
    // The spend cap, and it has to live here: a client cannot be trusted with
    // it, and it is the only thing standing between a tapped button and an
    // unbounded bill (a charged one for a customer, a model bill for the owner).
    // Refunded rows do not count — that review was given back.
    const month = monthBounds(new Date());
    const { count: thisMonth, error: monthErr } = await admin
      .from("spending_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .neq("status", "refunded")
      .gte("created_at", month.start);
    // Fail closed, like the limit above: a null count coalesced to zero would
    // switch the cap off exactly when the database is struggling.
    if (monthErr || thisMonth === null) {
      return json({ error: "Could not start a review. Try again shortly." }, 503);
    }
    const allowance = free ? REVIEWS_PER_MONTH.free : REVIEWS_PER_MONTH.paid;
    if (thisMonth >= allowance) {
      return json(
        {
          error: `That's your review for this month. The next one opens ${month.nextLabel}.`,
        },
        429,
      );
    }

    if (!free && (!stripeKey || !appUrl)) {
      // Not on the free list, and there is no way to charge: the feature is not
      // open. This is the default for a fresh deployment, on purpose.
      return json(
        {
          error:
            "Spending reviews aren't open yet — this one is still being tried out.",
        },
        403,
      );
    }
    if (!free && (!Number.isInteger(priceCents) || priceCents <= 0)) {
      return json({ error: "Payments are misconfigured." }, 500);
    }

    // A free grant is idempotent per window. Tapping twice — or tapping again
    // after a generation dropped — resumes the row already waiting to be written
    // instead of minting another, because every row is worth MAX_ATTEMPTS model
    // calls and nothing else caps a route that charges nothing. A row that has
    // its body is left alone, so asking for a fresh take still makes a new one.
    if (free) {
      const { data: waiting } = await admin
        .from("spending_reviews")
        .select("id")
        .eq("user_id", user.id)
        .eq("period_id", periodId)
        .eq("period_from", from.toISOString())
        .in("status", ["paid", "ready"])
        .is("body_enc", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (waiting) {
        // Two of the windows end when they were asked for, so a row left
        // unwritten yesterday covers yesterday. Resuming it moves its end to now
        // — the device rebuilds the digest from the row's own bounds, so the two
        // stay in step, and the review covers up to when it was actually asked
        // for rather than to when the first attempt was.
        await admin
          .from("spending_reviews")
          .update({ period_to: to.toISOString() })
          .eq("id", waiting.id);
        return json({ review_id: waiting.id, free: true }, 200);
      }
    }

    // --- the row owns the facts, and is created before any payment exists ---
    // A free review is born `paid` at a price of 0: nothing is owed, so there is
    // no pending state to wait out and no webhook to wait for.
    const { data: review, error: insertErr } = await admin
      .from("spending_reviews")
      .insert({
        user_id: user.id,
        status: free ? "paid" : "pending",
        period_id: periodId,
        period_from: from.toISOString(),
        period_to: to.toISOString(),
        home_currency: homeCurrency,
        price_cents: free ? 0 : priceCents,
        price_currency: "usd",
        ...(free ? { paid_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();
    if (insertErr || !review) {
      return json({ error: insertErr?.message ?? "Could not start a review." }, 500);
    }

    // The free path stops here: the browser can go straight to generating it.
    if (free) return json({ review_id: review.id, free: true }, 200);

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
