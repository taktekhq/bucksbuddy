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
// Secrets to set:
//   GEMINI_API_KEY — aistudio.google.com → Get API key
//   GEMINI_MODEL   — optional; a model id to try first. Google retires ids and
//                    closes old ones to new API keys, so the id is neither a
//                    constant nor a guess: this function tries the configured id
//                    (if any) and then a short list of fallbacks, and records
//                    whichever one answered in the review's `model` column. Set
//                    this only to override that order.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The Gemini SDK is imported LAZILY, inside the handler and before this request
// spends anything. A static import that fails to resolve takes the whole
// function down at boot with a platform error and no explanation; loaded this
// way, a resolution failure costs no attempt and lands in the row as a sentence,
// with the detail in the function logs. Deno caches the module after the first
// successful load, so this is a one-off, not a per-request cost.
//
// Only the surface this function uses is typed, because the module is now
// untyped at the import site.
type Turn = { role: "user" | "model"; parts: { text: string }[] };
type GenAI = {
  models: {
    generateContent: (req: {
      model: string;
      contents: Turn[];
      config: Record<string, unknown>;
    }) => Promise<{
      text?: string;
      candidates?: { finishReason?: string }[];
    }>;
  };
};
type GenAICtor = new (opts: { apiKey: string }) => GenAI;

let cachedCtor: GenAICtor | null = null;

async function genAIClient(apiKey: string): Promise<GenAI> {
  if (!cachedCtor) {
    try {
      const mod = await import("https://esm.sh/@google/genai@2.22.0");
      cachedCtor = (mod as { GoogleGenAI: GenAICtor }).GoogleGenAI;
    } catch (err) {
      console.error("generate-review: could not load @google/genai:", err);
      throw new Error("Couldn't load the Gemini client on the server.");
    }
  }
  return new cachedCtor({ apiKey });
}

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

// Model ids are not stable ground: Google retires them on its own schedule and
// closes older ones to keys created after a cutoff, so an id that works for one
// project 404s for another. Rather than pin one and hope, try a short list and
// record the winner in the row's `model` column — the working id becomes a fact
// in the data instead of a thing to rediscover. Newest first, and a "-latest"
// alias first of all, since that one survives a rename.
const MODEL_CANDIDATES = [
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

/** The ids to try, configured one first. */
function modelCandidates(): string[] {
  const configured = Deno.env.get("GEMINI_MODEL");
  const ids = configured ? [configured, ...MODEL_CANDIDATES] : MODEL_CANDIDATES;
  return [...new Set(ids)];
}

/**
 * Is this "that model isn't callable with this key", rather than a real failure?
 * Only a name problem is worth trying the next id for — a rate limit, a bad key
 * or a safety block would fail identically on every one of them.
 */
function isModelUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /not\s*found|no longer available|not available|unsupported model|does not exist|unexpected model name/i
    .test(message);
}

/** Finish reasons that mean no usable review came back. */
const BAD_FINISH: Record<string, string> = {
  SAFETY: "The model declined to write this review.",
  PROHIBITED_CONTENT: "The model declined to write this review.",
  BLOCKLIST: "The model declined to write this review.",
  RECITATION: "The model declined to write this review.",
  SPII: "The model declined to write this review.",
  MAX_TOKENS: "The review ran past its length limit and came back unfinished.",
  // Structured output that could not be coerced to the schema, and a follow-up
  // turn a thinking model would not accept. Both are reachable here, so both get
  // a sentence rather than falling through to "came back empty".
  MALFORMED_RESPONSE: "The review came back in a shape the app could not read.",
  MISSING_THOUGHT_SIGNATURE:
    "The review's follow-up lost the model's own context. Tap to try again.",
};

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
      // In the schema, not only in the description: the parser rejects an empty
      // sections array, so a response with none would be valid output that costs
      // a generation. minItems/maxItems are enforced by the API.
      minItems: 3,
      maxItems: 5,
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

// --- the window check, and the numbers guarantee ---
// #region verifiable — lifted out and exercised by scripts/verify-edge-functions.mjs

/**
 * Does `claimed` — a `YYYY-MM-DD` the device wrote from its OWN calendar — name
 * the day of `instant`, an ISO timestamp stored on the review row?
 *
 * The two are the same moment described twice. The row holds the instant that
 * the device's local midnight was; the digest labels the window with the local
 * date that midnight belongs to. Those agree only at UTC: east of it the local
 * date runs a day ahead of the instant's UTC date (Beirut's 2026-08-01 midnight
 * is 2026-07-31T21:00Z), west of it a day behind. So a day either side counts as
 * naming it — which still refuses a digest for a different window, because the
 * periods on offer are whole months apart.
 */
function namesDay(claimed: unknown, instant: string): boolean {
  if (typeof claimed !== "string") return false;
  const t = new Date(instant).getTime();
  if (Number.isNaN(t)) return false;
  const day = 86_400_000;
  return [-day, 0, day].some(
    (shift) => claimed === new Date(t + shift).toISOString().slice(0, 10),
  );
}

/**
 * The amounts a review may quote: the digest's `display` strings — the ones the
 * app itself would print — and each one's bare form, so "1,240.50 on groceries"
 * is accepted as a correct quote of "$1,240.50".
 *
 * Deliberately NOT every number in the digest. The digest also carries raw
 * `cents` integers and counts, and pooling those with the amounts would let a
 * review print "$124050" or "$47200" — digits that exist, as a figure the device
 * never computed — and pass.
 */
function collectAmounts(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectAmounts(v, into);
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "display" && typeof v === "string") {
        const text = normalize(v);
        into.add(text);
        const bare = text.replace(/^[^\d]+/, "");
        if (bare !== "") into.add(bare);
      } else {
        collectAmounts(v, into);
      }
    }
  }
}

/**
 * Every scalar in the digest, for judging a bare number. Counts, day totals and
 * percentages are legitimately quotable and are not amounts, so they get the
 * looser pool.
 */
function collectNumbers(value: unknown, into: Set<string>): void {
  if (typeof value === "number" || typeof value === "string") {
    const text = normalize(String(value));
    into.add(text);
    // Also without the sign. The digest holds a decrease as `changePct: -53.3`,
    // and a review describing it truthfully writes "fell 53.3%" — the token
    // matcher starts at the first digit and can never capture the minus, so
    // pooling only the signed form flagged every honest sentence about spending
    // going down. The unsigned form is the same figure the device computed, and
    // this is the loose pool for ambiguous bare numbers; the strict pool of
    // formatted amounts is untouched.
    if (text.startsWith("-")) into.add(text.slice(1));
  } else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectNumbers(v, into);
  }
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

// Two classes of figure, judged differently.
//
// CURRENCY-MARKED — a symbol or code before or after the number ("$12.50",
// "LL 89,500", "1200 USD", "1200€"). Unambiguously an amount, so it is held
// strictly to the strings the device formatted.
const CURRENCY_TOKEN =
  /(?:\p{Sc}|\b[A-Z]{2,3}\s?)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:\p{Sc}|\b[A-Z]{3}\b)/gu;

// PLAIN NUMERIC — a decimal, a separator-grouped integer, or a run of four or
// more digits. Ambiguous: "38.1" is a percentage, "1,234" a count, "2400" could
// be an amount written without its symbol. These are accepted if they appear
// anywhere in the digest at all, so a truthful count is never thrown away, while
// an invented figure still has nothing to stand on. Years are skipped — a review
// may name one and they are not in the digest as bare numbers — and small bare
// integers are left alone entirely, since guarding them would reject ordinary
// prose.
const NUMERIC_TOKEN = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+\b|\b\d{4,}\b/g;
const YEAR = /^(19|20)\d{2}$/;

/**
 * The figures in `text` the digest does not support.
 *
 * `amounts` holds what the device formatted; `numbers` holds every scalar in the
 * digest. A currency-marked token must be in `amounts`. A plain number may be in
 * either.
 */
function unsupportedAmounts(
  text: string,
  amounts: Set<string>,
  numbers: Set<string>,
): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  const flag = (raw: string) => {
    if (seen.has(raw)) return;
    seen.add(raw);
    bad.push(raw);
  };

  for (const match of text.matchAll(CURRENCY_TOKEN)) {
    const token = normalize(match[0]);
    // Accept the bare number inside a quoted amount, so a dropped symbol is not
    // mistaken for an invention.
    const bare = token.replace(/^[^\d]+/, "").replace(/[^\d.,]+$/, "");
    if (!amounts.has(token) && !amounts.has(bare)) flag(match[0]);
  }

  // Strip the currency-marked tokens first, so the digits inside "$1,240.50" are
  // not judged a second time under the looser rule.
  for (const match of text.replace(CURRENCY_TOKEN, " ").matchAll(NUMERIC_TOKEN)) {
    const token = match[0];
    if (YEAR.test(token)) continue;
    const plain = normalize(token);
    const ungrouped = plain.replace(/,/g, "");
    if (
      !amounts.has(plain) &&
      !amounts.has(ungrouped) &&
      !numbers.has(plain) &&
      !numbers.has(ungrouped)
    ) {
      flag(token);
    }
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
    const apiKey = Deno.env.get("GEMINI_API_KEY");
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
      .select(
        "id, status, attempts, period_id, period_from, period_to, body_enc, price_cents",
      )
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
      // Only offer a refund for a review that was actually charged for. A free
      // grant is priced at zero and there is nothing to give back.
      return json(
        {
          error:
            review.price_cents > 0
              ? "This review used up its attempts. Get in touch and we'll refund it."
              : "This review used up its attempts.",
        },
        409,
      );
    }
    // The digest has to describe the window this review is for — not just a
    // window of the same shape. Otherwise a crafted pair of requests could pay
    // for one period and be handed a review of another.
    const period = digest.period as { id?: unknown; from?: unknown; to?: unknown } | undefined;
    if (
      !period ||
      period.id !== review.period_id ||
      !namesDay(period.from, review.period_from) ||
      // `to` is stored exclusive and the digest carries the last day inside it.
      !namesDay(
        period.to,
        new Date(new Date(review.period_to).getTime() - 86_400_000).toISOString(),
      )
    ) {
      return json({ error: "That digest is for a different period." }, 400);
    }

    // Load the client before the attempt is claimed: if the module cannot be
    // resolved, nothing has been spent and the row says why.
    const ai = await genAIClient(apiKey);

    // Spend the attempt as a COMPARE-AND-SWAP, not a read-then-write: it is the
    // claim on this generation. Without the `attempts` predicate, N concurrent
    // requests for the same paid review would all read the same count, all pass
    // the cap above, and all call the model — one payment, unlimited spend.
    const { data: claimed, error: claimErr } = await admin
      .from("spending_reviews")
      .update({ attempts: review.attempts + 1 })
      .eq("id", reviewId)
      .eq("attempts", review.attempts)
      .select("id");
    if (claimErr) return json({ error: claimErr.message }, 500);
    if (!claimed || claimed.length === 0) {
      return json({ error: "This review is already being written." }, 409);
    }

    // --- write it ---
    const amounts = new Set<string>();
    collectAmounts(digest, amounts);
    const numbers = new Set<string>();
    collectNumbers(digest, numbers);

    // Gemini takes the conversation as `contents`; the model's own turn has the
    // role "model". The corrective re-ask below appends to this.
    const contents: Turn[] = [
      {
        role: "user",
        parts: [
          {
            text: `Write my spending review from this digest.\n\n${JSON.stringify(digest, null, 1)}`,
          },
        ],
      },
    ];

    // Whichever id answers, for the correction turn and for the record.
    let chosen: string | null = null;

    async function askModel(model: string): Promise<{ review: Review; raw: string }> {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM,
          // Structured output: the schema is enforced by the API, so the app
          // renders fields rather than parsing prose, and there is no markup.
          responseMimeType: "application/json",
          responseJsonSchema: SCHEMA,
          // A ceiling, not a reservation — nothing is billed unless it is spent.
          // It has to be generous because thinking tokens are charged against
          // this same budget: a cap sized to the document alone gets consumed by
          // reasoning and comes back MAX_TOKENS with nothing in it.
          maxOutputTokens: 32000,
          // Low, not zero: the review should read like prose, not vary in what
          // it claims — and it cannot vary in its figures, which are given.
          temperature: 0.4,
          // Thinking is deliberately left at the model's default. The field that
          // configures it changed across model generations (a token budget, then
          // a level) while the id here is a secret, so setting it would couple
          // this file to a family it cannot know it is talking to.
        },
      });

      // A blocked or truncated response carries no usable JSON, and `.text` is
      // legitimately undefined — so check why before trying to parse nothing.
      const finish = response.candidates?.[0]?.finishReason;
      if (finish && BAD_FINISH[finish]) throw new Error(BAD_FINISH[finish]);
      const raw = response.text;
      if (!raw) throw new Error("The review came back empty.");

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The review came back in an unexpected shape.");
      }
      return { review: parseReview(parsed), raw };
    }

    /** Ask, walking down the candidate ids until one is callable. */
    async function ask(): Promise<{ review: Review; raw: string }> {
      const tries = chosen === null ? modelCandidates() : [chosen];
      let last: unknown = null;
      for (const candidate of tries) {
        try {
          const out = await askModel(candidate);
          chosen = candidate;
          return out;
        } catch (err) {
          if (!isModelUnavailable(err)) throw err;
          last = err;
        }
      }
      throw new Error(
        `No Gemini model this key can call — tried ${tries.join(", ")}. Set the GEMINI_MODEL secret to a current id. (${
          last instanceof Error ? last.message : String(last)
        })`,
      );
    }

    let { review: written, raw } = await ask();
    let unsupported = unsupportedAmounts(reviewText(written), amounts, numbers);

    // The guard fails closed, and it is the reason this is safe to sell — but a
    // single dropped decimal would otherwise cost someone a paid generation. So
    // name the offending tokens once and let it try again inside the same
    // attempt; a second failure is a real one.
    if (unsupported.length > 0) {
      // The correction goes back as one user turn that quotes the draft, rather
      // than replaying the draft as a model turn. A thinking model expects its
      // own turn to return with the thought signature it issued, and rejects one
      // that arrives without it — quoting says the same thing and cannot trip on
      // that. It also keeps the whole exchange inside one attempt.
      contents.push({
        role: "user",
        parts: [
          {
            text: `That draft cannot be shown, because these amounts do not appear in the digest: ${unsupported
              .slice(0, 8)
              .join(
                ", ",
              )}. Every amount must be copied character-for-character from a "display" field. Write the review again, using only figures that are in the digest, and leaving out any claim you cannot support with one.\n\nThe rejected draft, for reference:\n${raw}`,
          },
        ],
      });
      ({ review: written } = await ask());
      unsupported = unsupportedAmounts(reviewText(written), amounts, numbers);
    }
    if (unsupported.length > 0) {
      // The rejected tokens are usually the user's own amount in a slightly
      // different format, and `error` is a plaintext column that the archive
      // renders — so the count goes in the record and the values go only to the
      // device that asked.
      const spent = review.attempts + 1;
      await admin
        .from("spending_reviews")
        .update({
          error: `The review quoted ${unsupported.length} figure(s) that aren't in your own totals, twice over, so it was thrown away rather than shown to you.`,
          // This path returns instead of throwing (to keep the rejected values
          // out of the database), so it has to apply the terminal transition
          // itself — otherwise the row stays `paid` with no attempts left and the
          // archive keeps offering a tap that can only fail.
          ...(spent >= MAX_ATTEMPTS ? { status: "failed" } : {}),
        })
        .eq("id", reviewId);
      return json(
        {
          error:
            "That review quoted figures that aren't in your own totals, so it was thrown away rather than shown to you. Try again.",
          unsupported: unsupported.slice(0, 8),
        },
        502,
      );
    }

    await admin
      .from("spending_reviews")
      .update({ status: "ready", model: chosen, error: null })
      .eq("id", reviewId);

    return json({ review: written }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // What the archive shows. An SDK failure carries Google's whole serialised
    // error body, and `error` is a plaintext column this app renders as a
    // review's subtitle — so the row gets a sentence and the raw text stays in
    // the function logs, where it is actually useful.
    console.error("generate-review failed:", message);
    const stored = message.length > 160 || /[{}]/.test(message)
      ? "The review couldn't be written. Tap to try again."
      : message;
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
          error: stored,
          ...((row?.attempts ?? 0) >= MAX_ATTEMPTS ? { status: "failed" } : {}),
        })
        .eq("id", reviewId)
        .neq("status", "refunded");
    }
    return json({ error: message }, 502);
  }
});
