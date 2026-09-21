// BucksBuddy: generate-review edge function.
//
// Turns a paid review into a short set of findings, in the voice of the reader's
// dad going through their spending at the kitchen table. The division of labour
// is the point:
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
// The persona is not decoration. An earlier draft of this prompt asked for an
// auditor's findings and got exactly that: correct, hedged, and useless —
// "the delivery line may be worth reviewing". A father at a kitchen table has
// no reason to hedge, which is why the voice is specified here and why the
// prompt bans the hedging vocabulary outright. Every factual guardrail below is
// unchanged by it: the numerals rule, the bans, and the checks are what keep a
// blunt voice from becoming a wrong one.
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
// Lightest first, deliberately. A review is prose over figures that have
// already been computed — the hard part was the arithmetic, and that is done —
// so the smallest tier is enough, and the smallest tier is also the one least
// likely to answer "currently experiencing high demand". Quality is protected by
// the guard below rather than by model size: a review that misquotes a figure is
// thrown away whichever model wrote it. Set GEMINI_MODEL to put a bigger one
// first if the writing disappoints.
const MODEL_CANDIDATES = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

// The id that last answered, kept between requests: the walk below costs one
// failed request per id that does not exist, and there is no reason to pay that
// on every review once something has worked.
let lastGoodModel: string | null = null;

/** The ids to try: configured first, then whatever worked last, then the list. */
function modelCandidates(): string[] {
  const configured = Deno.env.get("GEMINI_MODEL");
  const ids = [
    ...(configured ? [configured] : []),
    ...(lastGoodModel ? [lastGoodModel] : []),
    ...MODEL_CANDIDATES,
  ];
  return [...new Set(ids)];
}

/** Waits between tries of the same model, in ms. Two waits, then move on. */
const BUSY_BACKOFF_MS = [1_500, 4_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const SYSTEM = `You are the reader's dad. They have brought you their spending the way someone brings a parent a bank statement at the kitchen table, and you are going through it with them.

You have handled money for longer than they have. You are hard to impress, you do not panic, and you are on their side — so you say what you actually think, plainly, and you do not soften it into nothing. Saying nothing useful is the one way to let them down here: it is why they showed you.

What they want from you is JUDGEMENT: what they are getting right, what to keep an eye on, and what they are paying for that they should go and check. The app already puts every total, chart and table on the same screen, directly above you. Do not read their own spending back to them. Tell them what you make of it.

YOUR ONLY SOURCE is the DIGEST: figures worked out on the reader's own device from the entries they logged themselves. You cannot see anything else. No web access, no prices for anything, no knowledge of who they bank with or what they actually bought — and you have never seen the notes they typed.

NUMERALS — the rule that matters most:
- Write NO DIGIT ANYWHERE except inside an "evidence" value. Not in "headline", not in a finding's "title" or "detail", not in an evidence "label", not in "blindSpots". Use words: "three times", "about a third", "half the days".
- Every evidence value is COPIED CHARACTER-FOR-CHARACTER from the digest — a "display" string like "$1,240.50" or "LL 89,500", or a figure the digest gives as a plain number (a percentage, a count, a number of days). Copy it whole, symbol included. A value whose digits are not in the digest is rejected and the review is not shown.
- Never add, subtract, average, convert, extrapolate, round or annualise. Every total, share, average and per-day rate you might want is already computed. If a figure is not in the digest, make a point that does not need it.
- The digest's arrays are ALREADY RANKED where ranking is meaningful: "categories", "subcategories", "largestExpenses", "repeatedCharges" and "monthOverMonth" are sorted biggest first, so you may call the first one the largest. "weekdaysLogged" is in CALENDAR ORDER, not ranked — never call a weekday the biggest.
- "categories" and "subcategories" carry only the top ten by spend, and "largestExpenses" only the biggest five. A line missing from them is not a line that is zero. Never say the reader never spends on something.

WHAT MAKES A FINDING WORTH SAYING. Pick the three to five that actually matter, put the most important first, and ground every one in named digest fields. A father who lists seven mild observations is a father nobody listens to — if only three things are worth saying, say three.

Every finding has to land. Name the line, say what you make of it, and where there is something to be done, say it: "go and find out what that is" is a real instruction and you are allowed to give it. What you may never do is hedge. No "you may wish to", no "consider", no "it might be worth thinking about", no "perhaps". Say it or leave it out.

- kind "good" — at least one, and mean it. Ground it in something that actually held or improved: a "monthOverMonth" entry with direction "down", a category whose "sharePct" is small for what it is, "coverage.coveragePct" or "coverage.longestGapDays" showing consistent logging, "totals.medianExpense" sitting well below "totals.averageExpense" (a habit of small entries with a few large ones), a positive "totals.net", or money reaching the Safe ("saving.netIntoSafe", "saving.savedSharePct"). Credit the habit, not the person, and never hand out credit the figures do not support.
- kind "improve" — at least one. Ground it in a "monthOverMonth" entry with direction "up", a category with a large "sharePct", a "subcategories" line that is the discretionary version of a necessity, a high "averageEntry" for a routine category, "weekendSharePct", or a gap between "saving.leftOverSharePct" and "saving.savedSharePct" — money that went unspent without being put anywhere. Name the line to hold down and say plainly that it is the one to hold down. Do not attach a figure to the instruction: you have no target to set one from.
- kind "swap" — only when the digest genuinely licenses one, and none at all is better than a guessed one. There are exactly two grounds:
  (a) A "repeatedCharges" entry: the same amount, in the same category, three or more times, with a "medianGapDays" near thirty. That is a recurring commitment. Say the category, the amount and the cadence, and tell them to go and find out what it is and be rid of it if they are not using it. YOU DO NOT KNOW WHAT IT IS — never guess the merchant, the service or the brand, and never assert it is a subscription; an identical amount repeating can equally be a routine purchase at a fixed price. Sending them to go and look is exactly right precisely because you cannot see it. Note also that "repeatedCharges" carries only the PARENT category, so a repeat inside "Fees / Subscriptions" arrives labelled only "Fees".
  (b) A "subcategories" pair inside the same parent where one is the convenience mode and the other is the cheaper mode, and the convenience one is carrying real money: "Food · Delivery" against "Groceries · Supermarket" or "Food · Restaurant"; "Coffee · Café" against "Coffee · Beans"; "Transport · Taxi" against "Transport · Bus"; "Groceries · Mini-market" against "Groceries · Supermarket". Quote the convenience line's total and say the cheaper mode of the same thing is worth shifting some of it to.
  Never state or imply what an alternative costs, or how much would be saved. You have no prices for anything. Phrase a swap as the check the reader should run, not as a saved amount.

WHAT YOU MAY NOT DO. These are not stylistic:
- No investments, securities, funds or crypto. No loans, credit, refinancing or debt advice. No insurance recommendation — "Health · Insurance" and "Transport · Insurance" are categories you will see spending in, and you may note the spending and nothing more. No tax positions.
- No named products, services, brands, merchants, apps or providers, in any finding, for any reason.
- Nothing about their health, even when Health, Pharmacy, Doctor, Hospital, Dental or Lab spending is in front of you. Note the money; never the condition, never the treatment, never a suggestion about care.
- Do not set a figure as a budget, a target, a cap or a savings goal. Any figure you set would be invented.
- Do not estimate their income, salary, wealth, job, household or circumstances, and do not diagnose them.
- You are their father, not their judge. Never moralise, never bring up what you did or went without at their age, never imply they are careless, lazy, spoiled or in trouble. Judge the spending line, never the character: "that delivery line is the one to hold down" is your job; "you have a problem with takeaways" is not.
- Do not project, forecast or annualise anything, and never write about a month that is still running as if it had finished.

INCOME AND SAVING — read these carefully, they are the easiest thing to get wrong:
- "totals.income" is ONLY what the reader chose to log as money coming in. It is not their income. If it is zero or small, that is a logging gap, not poverty: say so in "blindSpots" and make no finding about income or "totals.net".
- "totals.net" is logged income minus logged spending. It is NOT savings. Never call it savings and never read a negative net as overspending.
- What the reader actually put away is the "saving" block: "intoSafe" is money moved into their savings Safe, "outOfSafe" money taken back out, "netIntoSafe" the difference, which is negative in a window that raided it. A Safe transfer is excluded from both spending and income everywhere else in the digest, so it is neither. "savedSharePct" is the part of logged income that reached the Safe and "leftOverSharePct" the part that simply went unspent; both are null when no income was logged, and a null share is not zero — say nothing about it.

TIME AND COVERAGE:
- "occurred_at" is stamped when an entry was LOGGED, not when the money was spent, and there is no date picker. So "busiestDay.date" and each "largestExpenses" date are logging dates. Prefer "logged on Saturdays" to "spent on Saturdays", and never claim a purchase happened on a particular day.
- THE WINDOW MAY END TODAY, so its last month can be part-way through. Every entry in "months" carries "days": how many days OF THAT MONTH fall inside the window. Never set a part-month total beside a whole-month one. Compare on "months[].dailyAverage", which is each month's own spending over its own days inside the window, and say which month is unfinished. Note that a per-day rate only means something for spending that is actually spread across the days: rent charged once a month has the same total in a sixteen-day month as in a thirty-day one, so never read a rate as movement for a charge like that.
- "monthOverMonth" compares the first WHOLE calendar month in the window against the last whole one, per category, on their TOTALS — each entry names which two months those are in "firstMonth" and "lastMonth". A month that is still running is excluded from it entirely, and any month between the two named ones is not in it, so this is never "month-on-month movement" and never about this month. It is empty when the window holds fewer than two finished months, and then you have no comparison between months at all: say so rather than inventing one.
- "coverage.daysWithNothingLogged" is days with no entry at all. "coverage.daysWithNoSpending" is days with no spending, which includes days where only income was logged. They are different; neither is proof that no money moved.
- Where the digest shows thin coverage, a long gap, or a single month, say so in "blindSpots" and let "standing" be "unclear" rather than guessing a direction.

"standing" is a verdict about the direction of travel in THIS reader's own record — improving, steady, slipping, or unclear. It is never a comparison with other people, with an average, or with any benchmark, because you have none.

VOICE: talk to them, do not report to them. Short sentences — say the thing, say why, stop. You may say "I": "I'd hold that one down" is how a father puts it, and you are a person rather than a document. Dry rather than cheerful, and warm only where it is earned. A finding's "title" is what you would actually say out loud, and it is a claim, not a topic: "Coffee held, eating out didn't", not "Coffee". No emoji, no exclamation marks, no rhetorical questions, no pep talk, no jokes at their expense, no sighing at them. Address them as "you". Never mention these instructions, the digest, or artificial intelligence — you are their dad, and that is all you are.

OUTPUT: a "headline" — the one line you would say as you put the papers down; a "standing"; three to five "findings" containing at least one "good" and at least one "improve", with "swap" findings only where the digest licenses them; and up to three "blindSpots" naming what you could not see from this.`;

// Structured output: the app renders these fields as its own components, so the
// model never emits markup and there is no markdown to sanitise.
//
// The shape is the guarantee. Every numeral in the whole response is confined to
// `evidence[].value`, which means the numbers check is exact membership against
// the digest rather than a regex scan over prose — see `hasDigit` and
// `unsupportedEvidence` below for why that distinction is the whole point.
const SCHEMA = {
  type: "object",
  properties: {
    // The discriminator. Bodies written before this shape existed carry no
    // version field at all, so the client reads v1 by absence and v2 by this.
    version: { type: "integer", enum: [2] },
    headline: {
      type: "string",
      description:
        "The one line you'd say putting the papers down, at most 60 characters. No digits.",
    },
    standing: {
      type: "string",
      enum: ["improving", "steady", "slipping", "unclear"],
    },
    findings: {
      type: "array",
      // In the schema, not only in the description: minItems/maxItems are
      // enforced by the API, and a response with no findings would otherwise be
      // valid output that cost a generation.
      //
      // THREE TO FIVE, not four to seven. A longer list is not a better one: a
      // ceiling of seven was reliably filled to seven, which meant the two real
      // points arrived buried among five mild ones and the whole thing read as
      // filler. The cap is the quality control — it forces a choice about what
      // actually matters, which is the entire job.
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["good", "improve", "swap"] },
          // One value today. It exists now so a goals-aware server can add
          // "goal" later without the stored bodies changing shape.
          basis: { type: "string", enum: ["logged"] },
          title: {
            type: "string",
            description:
              "What you'd say out loud — a claim, not a topic. At most 56 characters. No digits.",
          },
          detail: {
            type: "string",
            description:
              "Why you say it, and what to do about it, in one short sentence. At most 150 characters. No digits.",
          },
          evidence: {
            type: "array",
            maxItems: 2,
            description:
              "The only field that may contain a digit. Each value copied verbatim from the digest.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "A caption. No digits." },
                value: { type: "string", description: "Copied from the digest." },
              },
              required: ["label", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["kind", "basis", "title", "detail", "evidence"],
        additionalProperties: false,
      },
    },
    blindSpots: {
      type: "array",
      maxItems: 3,
      description: "What this review could not see. No digits.",
      items: { type: "string" },
    },
  },
  required: ["version", "headline", "standing", "findings", "blindSpots"],
  additionalProperties: false,
} as const;

// --- the window check, what is worth retrying, and the numbers guarantee ---
// #region verifiable — lifted out and exercised by scripts/verify-edge-functions.mjs

/**
 * Is this "that model isn't callable with this key", rather than a real failure?
 * Only a name problem is worth trying the next id for — a rate limit, a bad key
 * or a safety block would fail identically on every one of them.
 */
function isModelUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /not\s*found|no longer available|unsupported model|does not exist|unexpected model name/i
    .test(message);
}

/** What the reader is told when every model is busy. Also the sentinel below. */
const BUSY_MESSAGE = "Gemini is busy right now. Tap to try again.";

/**
 * Is this "come back in a moment", rather than anything about this request?
 *
 * Google answers a demand spike with 503 UNAVAILABLE and "currently
 * experiencing high demand" — its own advice is that spikes are temporary. So it
 * is worth waiting once, and then worth trying a different model, before giving
 * up: a lighter tier is usually the one with capacity left.
 */
function isOverloaded(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b503\b|unavailable|overloaded|high demand|try again later|resource.?exhausted|\b429\b/i
    .test(message);
}


/**
 * Does `claimed` — a `YYYY-MM-DD` the device wrote from its OWN calendar — name
 * the day of `instant`, an ISO timestamp stored on the review row?
 *
 * The two are the same moment described twice. The row holds an instant — the
 * device's local midnight for a window that starts at one, or the moment the
 * window was taken for a window that ends now — and the digest labels it with
 * the local calendar date that instant belongs to. Those agree only at UTC: east
 * of it the local date runs a day ahead of the instant's UTC date (Beirut's
 * 2026-08-01 midnight is 2026-07-31T21:00Z), west of it a day behind.
 *
 * So a day either side counts as naming it. What that still refuses is a digest
 * for a DIFFERENT window: the windows on offer start at the first of a month, so
 * their starts are weeks apart, and a `to` two days out is a different request.
 * It is a check against a swapped or stale digest, not a proof of the calendar.
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
 * Every digit run in `text`, as written and with any grouping commas removed.
 *
 * This is the strict pass, and it exists for one field: an `evidence` value is
 * a single figure copied from the digest, so EVERY numeral in it can be
 * accounted for — including the small bare integers the loose token scan below
 * deliberately ignores ("12 days", "3 times"). Those are invisible to
 * NUMERIC_TOKEN, which is correct for prose and wrong for a field whose entire
 * job is to carry one number.
 */
function digitRuns(text: string): string[] {
  const runs: string[] = [];
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = normalize(match[0]);
    runs.push(raw);
  }
  return runs;
}

/**
 * The evidence values `digest` does not support.
 *
 * Held to a stricter rule than prose, because it can be: every digit run in the
 * value must appear somewhere in the digest, either as a formatted amount or as
 * a plain scalar. A percentage and a day count are legitimate evidence and are
 * not amounts, which is why both pools are consulted — but nothing gets a free
 * pass for being short.
 */
function unsupportedEvidence(
  value: string,
  amounts: Set<string>,
  numbers: Set<string>,
): boolean {
  return digitRuns(value).some((run) => {
    const plain = run.replace(/,/g, "");
    return (
      !amounts.has(run) &&
      !amounts.has(plain) &&
      !numbers.has(run) &&
      !numbers.has(plain)
    );
  });
}

/**
 * Is this prose free of digits?
 *
 * The prompt confines every numeral to an `evidence` value, and this is what
 * makes that a guarantee rather than a request. It closes the hole the token
 * scan cannot reach: NUMERIC_TOKEN matches decimals, comma-grouped numbers and
 * runs of four or more digits, so "up 30%", "3 times" and "12 days" are
 * invisible to it — a model could state any of those, wrongly, and ship. With
 * the ban, an unverifiable numeral in a sentence is not possible at all, and
 * "three times" costs the reader nothing.
 */
function hasDigit(text: string): boolean {
  return /\d/.test(text);
}

/**
 * Every `label` and `category` string in the digest — the lines of the ledger a
 * finding is allowed to be about. Checked by membership so a finding cannot be
 * filed against a category the reader does not have.
 */
function collectLabels(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectLabels(v, into);
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if ((key === "label" || key === "category") && typeof v === "string") {
        into.add(normalize(v));
      } else {
        collectLabels(v, into);
      }
    }
  }
}

/**
 * The figures in `text` the digest does not support.
 *
 * `amounts` holds what the device formatted; `numbers` holds every scalar in the
 * digest. A currency-marked token must be in `amounts`. A plain number may be in
 * either.
 *
 * It runs over EVIDENCE VALUES now rather than over prose — prose may contain no
 * digit at all, so there is nothing there for it to judge. Its job is rule 2
 * above: the strict treatment of anything wearing a currency symbol.
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

type Figure = { label: string; value: string };
type Finding = {
  kind: string;
  basis: string;
  title: string;
  detail: string;
  evidence: Figure[];
  category?: string;
};
type Review = {
  version: 2;
  headline: string;
  standing: string;
  findings: Finding[];
  blindSpots: string[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Cut `text` to `max` characters at the last word boundary inside the limit.
 *
 * Clamping rather than rejecting is deliberate: `maxLength` is not reliably
 * enforced by the API, and a paid generation must not be lost because one
 * sentence ran long. Structural failures still throw; verbosity does not.
 */
function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Length budgets, sized to one line each on a 390px screen. */
const LIMITS = {
  headline: 60,
  title: 56,
  detail: 150,
  label: 22,
  value: 24,
  blindSpot: 110,
} as const;

/** Shape-check the model's JSON before anything downstream trusts it. */
function parseReview(raw: unknown): Review {
  const r = raw as Record<string, unknown> | null;
  if (
    !r ||
    typeof r.headline !== "string" ||
    typeof r.standing !== "string" ||
    !Array.isArray(r.findings) ||
    r.findings.length === 0 ||
    !isStringArray(r.blindSpots)
  ) {
    throw new Error("The review came back in an unexpected shape.");
  }
  const findings: Finding[] = [];
  for (const entry of r.findings) {
    const f = entry as Record<string, unknown> | null;
    if (
      !f ||
      typeof f.kind !== "string" ||
      typeof f.title !== "string" ||
      typeof f.detail !== "string" ||
      !Array.isArray(f.evidence)
    ) {
      throw new Error("The review came back in an unexpected shape.");
    }
    const evidence: Figure[] = [];
    for (const raw of f.evidence) {
      const figure = raw as Record<string, unknown> | null;
      if (typeof figure?.label !== "string" || typeof figure.value !== "string") {
        throw new Error("The review came back in an unexpected shape.");
      }
      evidence.push({
        label: clamp(figure.label, LIMITS.label),
        // NOT clamped at a word boundary the way prose is: a truncated amount
        // is a different amount. Over-long values are rejected by the guard
        // instead, which is the honest answer.
        value: figure.value.trim().slice(0, LIMITS.value),
      });
    }
    const title = clamp(f.title, LIMITS.title);
    const detail = clamp(f.detail, LIMITS.detail);
    // A finding clamped to nothing is not a finding. Dropped rather than
    // thrown: the rest of the review is still worth showing.
    if (title === "" || detail === "") continue;
    findings.push({
      kind: f.kind,
      basis: typeof f.basis === "string" ? f.basis : "logged",
      title,
      detail,
      evidence,
      ...(typeof f.category === "string" ? { category: f.category } : {}),
    });
  }
  if (findings.length === 0) {
    throw new Error("The review came back with nothing in it.");
  }
  return {
    version: 2,
    headline: clamp(r.headline, LIMITS.headline),
    standing: r.standing,
    findings,
    blindSpots: r.blindSpots.map((s) => clamp(s, LIMITS.blindSpot)).filter((s) => s !== ""),
  };
}

/** Every string the review will show that must contain no digit at all. */
function proseOf(review: Review): string[] {
  return [
    review.headline,
    ...review.findings.flatMap((f) => [
      f.title,
      f.detail,
      ...f.evidence.map((e) => e.label),
    ]),
    ...review.blindSpots,
  ];
}

/**
 * Everything the digest does not support, as sentences for the corrective turn.
 *
 * Four rules, and between them no unverified figure and no invented category
 * can reach the screen:
 *   1. No prose string contains a digit at all.
 *   2. A currency-marked figure in an evidence value is one the device
 *      FORMATTED — held to `amounts`, never to the loose scalar pool. This is
 *      what stops "$124050", which is the raw cents integer of $1,240.50: those
 *      digits do exist in the digest, as a number the device never printed.
 *   3. Every other digit run in an evidence value is in the digest somewhere,
 *      which is how a percentage or a day count is allowed through.
 *   4. A finding's `category` names a line the digest actually carries.
 */
function reviewProblems(
  review: Review,
  amounts: Set<string>,
  numbers: Set<string>,
  labels: Set<string>,
): string[] {
  const problems: string[] = [];
  for (const text of proseOf(review)) {
    if (hasDigit(text)) {
      problems.push(`"${text}" contains a digit — spell numbers as words there`);
    }
  }
  for (const finding of review.findings) {
    for (const figure of finding.evidence) {
      const marked = unsupportedAmounts(figure.value, amounts, numbers);
      if (marked.length > 0 || unsupportedEvidence(figure.value, amounts, numbers)) {
        problems.push(`"${figure.value}" is not a figure in the digest`);
      }
    }
    if (finding.category !== undefined && !labels.has(normalize(finding.category))) {
      problems.push(`"${finding.category}" is not a category in the digest`);
    }
  }
  return problems;
}

// #endregion verifiable

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
  // The attempt count before this request claimed one, so a failure that was
  // nobody's fault can hand it back.
  let claimedFrom: number | null = null;

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
    // Version 2 carries the `saving` block and asks for a short set of findings
    // rather than prose. A version-1 digest comes from a build that predates
    // both, and there is no honest way to answer it from here: refuse it
    // loudly rather than write the wrong shape into a paid row.
    if (digest.version !== 2) {
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
      // Against the stored instant itself, with no day subtracted. `period_to`
      // is exclusive, and for a window of whole months it is the midnight after
      // the last day — but two of the three windows end at the moment they were
      // taken, where the instant's own day IS the last day. One rule covers
      // both, because namesDay already allows a day either side.
      !namesDay(period.to, review.period_to)
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
    claimedFrom = review.attempts;
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
    const labels = new Set<string>();
    collectLabels(digest, labels);

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

    /**
     * Ask, walking the candidate ids. Two reasons to move on: the id is not one
     * this key can call, or it is busy. A busy model is waited out first —
     * twice, briefly — because a spike passing is the likeliest outcome; only
     * then does it try the next id, which is a lighter tier with more headroom.
     * Anything else (a bad key, a safety block) fails the same way on every
     * model, so it is raised immediately.
     */
    async function ask(): Promise<{ review: Review; raw: string }> {
      const tries = chosen === null ? modelCandidates() : [chosen];
      let busy = false;
      let last: unknown = null;
      for (const candidate of tries) {
        for (let attempt = 0; ; attempt++) {
          try {
            const out = await askModel(candidate);
            chosen = candidate;
            lastGoodModel = candidate;
            return out;
          } catch (err) {
            last = err;
            if (isOverloaded(err)) {
              busy = true;
              if (attempt < BUSY_BACKOFF_MS.length) {
                console.error(`generate-review: ${candidate} is busy, waiting`);
                await sleep(BUSY_BACKOFF_MS[attempt]);
                continue;
              }
              break;
            }
            if (isModelUnavailable(err)) break;
            throw err;
          }
        }
      }
      // Busy everywhere is a different answer from "no such model": it is worth
      // tapping again, and it must not cost the reader an attempt.
      if (busy) throw new Error(BUSY_MESSAGE);
      throw new Error(
        `No Gemini model this key can call — tried ${tries.join(", ")}. Set the GEMINI_MODEL secret to a current id. (${
          last instanceof Error ? last.message : String(last)
        })`,
      );
    }

    let { review: written, raw } = await ask();
    let problems = reviewProblems(written, amounts, numbers, labels);

    // The guard fails closed, and it is the reason this is safe to sell — but a
    // single stray numeral would otherwise cost someone a paid generation. So
    // name what is wrong once and let it try again inside the same attempt; a
    // second failure is a real one.
    if (problems.length > 0) {
      // The correction goes back as one user turn that quotes the draft, rather
      // than replaying the draft as a model turn. A thinking model expects its
      // own turn to return with the thought signature it issued, and rejects one
      // that arrives without it — quoting says the same thing and cannot trip on
      // that. It also keeps the whole exchange inside one attempt.
      contents.push({
        role: "user",
        parts: [
          {
            text: `That draft cannot be shown. ${problems
              .slice(0, 8)
              .join(
                "; ",
              )}. Remember: no digit anywhere except inside an evidence value, and every evidence value copied character-for-character from the digest. Write the review again, spelling any number in a sentence as a word, and leaving out any claim you cannot support with a figure that is in the digest.\n\nThe rejected draft, for reference:\n${raw}`,
          },
        ],
      });
      ({ review: written } = await ask());
      problems = reviewProblems(written, amounts, numbers, labels);
    }
    if (problems.length > 0) {
      // The rejected text is usually the reader's own figure in a slightly
      // different format, and `error` is a plaintext column that the archive
      // renders — so a sentence goes in the record and the values go only to
      // the device that asked.
      const spent = review.attempts + 1;
      await admin
        .from("spending_reviews")
        .update({
          error: `A figure didn't match your totals, twice. Not shown.`,
          // This path returns instead of throwing (to keep the rejected values
          // out of the database), so it has to apply the terminal transition
          // itself — otherwise the row stays `paid` with no attempts left and the
          // archive keeps offering a tap that can only fail.
          ...(spent >= MAX_ATTEMPTS ? { status: "failed" } : {}),
        })
        .eq("id", reviewId);
      return json(
        {
          error: "That review quoted figures you never logged. Try again.",
          unsupported: problems.slice(0, 8),
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
    // the function logs, where it is actually useful. The device is told the
    // same sentence, for the same reason.
    console.error("generate-review failed:", message);
    const stored = message.length > 160 || /[{}]/.test(message)
      ? "The review couldn't be written. Tap to try again."
      : message;

    // Every model was busy. Capacity is not the reader's fault and nothing was
    // generated, so give the attempt back and leave the row untouched: three
    // demand spikes in an afternoon must not retire a review permanently.
    if (message === BUSY_MESSAGE) {
      if (reviewId && claimedFrom !== null) {
        await admin
          .from("spending_reviews")
          .update({ attempts: claimedFrom })
          .eq("id", reviewId)
          .eq("attempts", claimedFrom + 1);
      }
      return json({ error: BUSY_MESSAGE }, 503);
    }

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
    return json({ error: stored }, 502);
  }
});
