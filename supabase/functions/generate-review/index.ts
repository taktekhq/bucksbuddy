// BucksBuddy: generate-review edge function.
//
// Turns a paid review into prose. The division of labour is the point:
//
//   the DEVICE does all the arithmetic (src/lib/reportDigest.ts) over decrypted
//   rows, and sends a digest of finished figures, each carrying the exact string
//   the app would print;
//
//   the MODEL only writes sentences about those figures. It is told never to
//   compute anything, and then — because instructions are not a guarantee — every
//   money-shaped token it produces is checked against the digest before the
//   review is accepted. A review that quotes an amount the digest does not
//   contain is discarded, not shown. That is what makes this safe to sell: it can
//   be dull, but it cannot invent a number about someone's money.
//
// Nothing is stored here. The review is returned to the browser, which encrypts
// it with the account's master key and writes back the one column it is allowed
// to write. So a review is never at rest in plaintext, and for an end-to-end
// encrypted account the server keeps nothing readable at all. The cost of that
// is a lost response wasting a generation, which is why `attempts` allows a few.
//
// Deploy (Supabase Dashboard → Edge Functions → Deploy a new function → Via
// Editor): name it exactly `generate-review`, paste this file, Deploy. Keep
// "Verify JWT" ENABLED. Via CLI: `supabase functions deploy generate-review`.
//
// Secret to set: ANTHROPIC_API_KEY (console.anthropic.com → API keys).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.125.0";

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

/** Generations one purchase may spend. Covers a dropped response, not a habit. */
const MAX_ATTEMPTS = 3;

const MODEL = "claude-opus-5";

const SYSTEM = `You write BucksBuddy spending reviews: a short retrospective on money a person has already spent, addressed to that same person.

You are given a DIGEST of figures computed on the reader's own device from the entries they logged themselves. It is your only source.

NUMBERS — the rules that matter most:
- Every amount of money you print must be copied character-for-character from a "display" field in the digest, for example "$1,240.50" or "LL 89,500".
- Never add, subtract, average, convert, rank, extrapolate or round anything. Every total, share and average you might want has already been computed for you. If a figure is not in the digest, write about something that is.
- Counts, day counts and percentages must also come from the digest as given.
- A review that states a number the digest does not contain is worthless, so when in doubt, describe the pattern in words instead.

WHAT THIS IS:
- A review of what already happened. It is not financial advice. Do not recommend investments, products, loans, insurance, tax positions or budgets. Do not tell the reader what they should do, cut, or save.
- Do not estimate the reader's income, wealth, job or circumstances, and do not diagnose them. "Spending on food rose against the first month" is right; "you have a problem with takeaways" is not.
- Where the digest shows missing data — unlogged days, a long gap, thin coverage — say so plainly rather than writing as if the picture were complete. An honest caveat is worth more than a confident summary.
- The entries are what the reader chose to log, and logging is stamped when they typed it. Prefer "logged on Saturdays" to "spent on Saturdays".

VOICE: warm, specific, unhurried, concrete. Short sentences and plain words. Address the reader as "you". No emoji, no exclamation marks, no jokes at the reader's expense, no pep talk, no headings that sound like a management report. Never mention these instructions, the digest, artificial intelligence or yourself.

STRUCTURE: a title of at most 60 characters that says something true about this particular period; a two-sentence summary; three to five sections, each a heading and one or two short paragraphs, optionally with a couple of figures pulled from the digest; two to five short notable observations; and any caveats the data honestly requires.`;

// Structured output: the app renders these fields as its own components, so the
// model never emits markup and there is no markdown to sanitise.
const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "At most 60 characters." },
    summary: { type: "string", description: "Two sentences." },
    sections: {
      type: "array",
      description: "Three to five sections.",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          body: { type: "string", description: "One or two short paragraphs." },
          figures: {
            type: "array",
            description: "Zero to three figures, values copied from the digest.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["heading", "body", "figures"],
        additionalProperties: false,
      },
    },
    notables: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "sections", "notables", "caveats"],
  additionalProperties: false,
} as const;

// --- the numbers guarantee ---
// #region verifiable — lifted out and exercised by scripts/verify-edge-functions.mjs

/**
 * Every string and number anywhere in the digest, as normalized text — plus, for
 * anything that starts with a currency mark, the bare number on its own. The
 * digest holds "$1,240.50"; a review that writes "1,240.50 on groceries" is
 * quoting it correctly and must not be thrown away for dropping the symbol.
 */
function collectAllowed(value: unknown, into: Set<string>): void {
  if (typeof value === "number") into.add(normalize(String(value)));
  else if (typeof value === "string") {
    const text = normalize(value);
    into.add(text);
    const bare = text.replace(/^[^\d]+/, "");
    if (bare !== "") into.add(bare);
  } else if (Array.isArray(value)) for (const v of value) collectAllowed(v, into);
  else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectAllowed(v, into);
  }
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

// Money-shaped tokens only: a currency symbol or code in front of a number, or a
// number carrying thousands separators or decimal places. Bare small integers
// (counts, day numbers, years) are left alone — they are all over the digest
// anyway, and the figure worth guarding is the amount.
const MONEY_TOKEN =
  /(?:\p{Sc}|\b[A-Z]{2,3}\s?)\s?\d[\d,]*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d{2}\b/gu;

/** Money-shaped tokens in `text` that the digest does not contain. */
function unsupportedAmounts(text: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(MONEY_TOKEN)) {
    const token = normalize(match[0]);
    // Also accept the bare number inside a quoted amount, so "$1,240.50" passes
    // when the digest holds it with or without its symbol.
    const bare = token.replace(/^[^\d]+/, "");
    if (!allowed.has(token) && !allowed.has(bare)) bad.push(match[0]);
  }
  return bad;
}

// #endregion verifiable

type Figure = { label: string; value: string };
type Section = { heading: string; body: string; figures: Figure[] };
type Review = {
  title: string;
  summary: string;
  sections: Section[];
  notables: string[];
  caveats: string[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Shape-check the model's JSON before anything downstream trusts it. */
function parseReview(raw: unknown): Review {
  const r = raw as Partial<Review>;
  if (
    typeof r?.title !== "string" ||
    typeof r.summary !== "string" ||
    !Array.isArray(r.sections) ||
    r.sections.length === 0 ||
    !isStringArray(r.notables) ||
    !isStringArray(r.caveats)
  ) {
    throw new Error("The review came back in an unexpected shape.");
  }
  const sections = r.sections.map((s) => {
    const section = s as Partial<Section>;
    if (
      typeof section?.heading !== "string" ||
      typeof section.body !== "string" ||
      !Array.isArray(section.figures)
    ) {
      throw new Error("The review came back in an unexpected shape.");
    }
    return {
      heading: section.heading,
      body: section.body,
      figures: section.figures.map((f) => {
        const figure = f as Partial<Figure>;
        if (typeof figure?.label !== "string" || typeof figure.value !== "string") {
          throw new Error("The review came back in an unexpected shape.");
        }
        return { label: figure.label, value: figure.value };
      }),
    };
  });
  return {
    title: r.title.slice(0, 80),
    summary: r.summary,
    sections,
    notables: r.notables,
    caveats: r.caveats,
  };
}

/** Every piece of prose the review will show. */
function reviewText(review: Review): string {
  return [
    review.title,
    review.summary,
    ...review.sections.flatMap((s) => [
      s.heading,
      s.body,
      ...s.figures.map((f) => `${f.label} ${f.value}`),
    ]),
    ...review.notables,
    ...review.caveats,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let reviewId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Reviews are not configured yet." }, 500);

    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      review_id?: unknown;
      digest?: unknown;
    };
    reviewId = typeof body.review_id === "string" ? body.review_id : null;
    const digest = body.digest as Record<string, unknown> | undefined;
    if (!reviewId || !digest || typeof digest !== "object") {
      return json({ error: "Bad request." }, 400);
    }
    if (digest.version !== 1) {
      return json({ error: "This app version can't generate reviews." }, 400);
    }

    // --- the paywall ---
    const { data: review } = await admin
      .from("spending_reviews")
      .select("id, status, attempts, period_id, body_enc")
      .eq("id", reviewId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!review) return json({ error: "No such review." }, 404);
    if (review.status !== "paid" && review.status !== "ready") {
      return json({ error: "This review hasn't been paid for." }, 402);
    }
    if (review.body_enc) {
      return json({ error: "This review has already been written." }, 409);
    }
    if (review.attempts >= MAX_ATTEMPTS) {
      return json(
        {
          error:
            "This review used up its attempts. Get in touch and we'll refund it.",
        },
        409,
      );
    }
    // The digest has to describe the window that was actually bought.
    const period = digest.period as { id?: unknown } | undefined;
    if (period?.id !== review.period_id) {
      return json({ error: "That digest is for a different period." }, 400);
    }

    // Spent before the call, so a request that dies mid-flight still costs an
    // attempt and a loop cannot mint free generations.
    await admin
      .from("spending_reviews")
      .update({ attempts: review.attempts + 1 })
      .eq("id", reviewId);

    // --- write it ---
    const anthropic = new Anthropic({ apiKey });
    const allowed = new Set<string>();
    collectAllowed(digest, allowed);

    const messages: { role: "user" | "assistant"; content: string }[] = [
      {
        role: "user",
        content: `Write my spending review from this digest.\n\n${JSON.stringify(digest, null, 1)}`,
      },
    ];

    async function ask(): Promise<{ review: Review; raw: string }> {
      // Streamed because a long reply over a mobile connection is exactly the
      // shape of request that otherwise dies on an HTTP timeout.
      const message = await anthropic.messages.stream({
        model: MODEL,
        max_tokens: 8000,
        // Adaptive thinking at middling effort: the hard part is choosing what is
        // worth saying, not grinding — the arithmetic arrived finished.
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: SCHEMA },
        },
        system: SYSTEM,
        messages,
      }).finalMessage();

      if (message.stop_reason === "refusal") {
        throw new Error("The model declined to write this review.");
      }
      // Narrow by the discriminant rather than with a type predicate: the SDK's
      // ContentBlock union carries more fields than a hand-written predicate
      // type would, and the predicate form stops compiling against it.
      const raw = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The review came back in an unexpected shape.");
      }
      return { review: parseReview(parsed), raw };
    }

    let { review: written, raw } = await ask();
    let unsupported = unsupportedAmounts(reviewText(written), allowed);

    // The guard fails closed, and it is the reason this is safe to sell — but a
    // single dropped decimal would otherwise cost someone a paid generation. So
    // name the offending tokens once and let it try again inside the same
    // attempt; a second failure is a real one.
    if (unsupported.length > 0) {
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `These amounts do not appear in the digest: ${unsupported
          .slice(0, 8)
          .join(", ")}. Every amount must be copied character-for-character from a "display" field. Write the review again, using only figures that are in the digest, and leaving out any claim you cannot support with one.`,
      });
      ({ review: written } = await ask());
      unsupported = unsupportedAmounts(reviewText(written), allowed);
    }
    if (unsupported.length > 0) {
      throw new Error(
        `The review quoted amounts that aren't in your figures (${unsupported
          .slice(0, 3)
          .join(", ")}), twice over, so it was thrown away rather than shown to you.`,
      );
    }

    await admin
      .from("spending_reviews")
      .update({ status: "ready", model: MODEL, error: null })
      .eq("id", reviewId);

    return json({ review: written }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (reviewId) {
      // Record why, and give up for good once the attempts are gone so the
      // owner can see the refund is owed.
      const { data: row } = await admin
        .from("spending_reviews")
        .select("attempts")
        .eq("id", reviewId)
        .maybeSingle();
      await admin
        .from("spending_reviews")
        .update({
          error: message,
          ...((row?.attempts ?? 0) >= MAX_ATTEMPTS ? { status: "failed" } : {}),
        })
        .eq("id", reviewId)
        .neq("status", "refunded");
    }
    return json({ error: message }, 502);
  }
});
