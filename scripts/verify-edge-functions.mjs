// Checks the two pieces of Edge Function logic that nothing else can.
//
// `supabase/functions/**` is outside the Vitest project (it is Deno, with remote
// imports and a top-level `Deno.serve`), so the unit suite cannot reach it — and
// the two functions below are exactly the ones where a silent regression would
// be expensive:
//
//   * the Stripe webhook signature check, which is the only thing standing
//     between "Stripe said this was paid" and anyone who can POST to the URL;
//   * the money-token guard, which is what makes a generated review safe to
//     sell — it throws away any review quoting an amount the device did not
//     compute.
//
// Each function marks the self-contained region this script exercises with
// `// #region verifiable`. The region is lifted out verbatim, written to a .mts
// file and imported with Node's type stripping, so what runs here is the same
// source that gets deployed — no copy to drift, and no types rewritten by hand.
//
// Run with:  npm run verify:functions
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failures.push(`${name}\n     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
}

/** Lift the `#region verifiable` block out of a function and import it. */
async function loadRegion(relativePath, exported) {
  const source = readFileSync(join(root, relativePath), "utf8");
  const start = source.indexOf("// #region verifiable");
  const end = source.indexOf("// #endregion verifiable");
  if (start === -1 || end === -1) {
    throw new Error(`${relativePath} has no "#region verifiable" block`);
  }
  const region = source.slice(start, end);
  const dir = await mkdtemp(join(tmpdir(), "bb-verify-"));
  const file = join(dir, `${randomUUID()}.mts`);
  await writeFile(file, `${region}\nexport { ${exported.join(", ")} };\n`);
  return import(file);
}

// ---------------------------------------------------------------- webhook ----
async function verifyWebhookSignatures() {
  console.log("\nstripe-webhook — signature verification");
  const { signaturesMatch, constantTimeEqual } = await loadRegion(
    "supabase/functions/stripe-webhook/index.ts",
    ["signaturesMatch", "constantTimeEqual"],
  );

  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  // Signed independently of the implementation, so this is a real cross-check.
  const sign = (ts, body = payload, key = secret) =>
    createHmac("sha256", key).update(`${ts}.${body}`).digest("hex");
  const now = Math.floor(Date.now() / 1000);

  check("a genuine signature verifies",
    await signaturesMatch(payload, `t=${now},v1=${sign(now)}`, secret), true);
  check("a signature from the wrong secret is rejected",
    await signaturesMatch(payload, `t=${now},v1=${sign(now, payload, "whsec_other")}`, secret), false);
  check("a tampered payload is rejected",
    await signaturesMatch(payload.replace("evt_1", "evt_2"), `t=${now},v1=${sign(now)}`, secret), false);
  check("a captured signature replayed later is rejected",
    await signaturesMatch(payload, `t=${now - 400},v1=${sign(now - 400)}`, secret), false);
  check("a signature inside the tolerance still verifies",
    await signaturesMatch(payload, `t=${now - 240},v1=${sign(now - 240)}`, secret), true);
  check("mid-rotation, one of two signatures matching is enough",
    await signaturesMatch(payload, `t=${now},v1=${sign(now, payload, "whsec_old")},v1=${sign(now)}`, secret), true);
  check("the timestamp is bound into the signature",
    await signaturesMatch(payload, `t=${now},v1=${sign(now - 10)}`, secret), false);
  check("a header with no timestamp is rejected",
    await signaturesMatch(payload, `v1=${sign(now)}`, secret), false);
  check("a header with no signature is rejected",
    await signaturesMatch(payload, `t=${now}`, secret), false);
  check("an empty header is rejected", await signaturesMatch(payload, "", secret), false);
  check("a non-numeric timestamp is rejected",
    await signaturesMatch(payload, `t=later,v1=${sign(now)}`, secret), false);
  check("comparison rejects a different length", constantTimeEqual("abc", "abcd"), false);
  check("comparison rejects one differing character", constantTimeEqual("abc", "abd"), false);
  check("comparison accepts an exact match", constantTimeEqual("abc", "abc"), true);
}

// ---------------------------------------------------------------- window ----
async function verifyWindowCheck() {
  console.log("\ngenerate-review — the period the digest claims");
  const { namesDay } = await loadRegion(
    "supabase/functions/generate-review/index.ts",
    ["namesDay"],
  );

  // The row stores the instant a device's local midnight was; the digest labels
  // that window with the local calendar date. The check has to hold for a device
  // anywhere, which is the bug it was written for: comparing the local date
  // against the instant's UTC date rejected every request east of UTC.
  check("UTC: the instant's own date", namesDay("2026-08-01", "2026-08-01T00:00:00.000Z"), true);
  check("Beirut (+03): local date runs a day ahead of the instant",
    namesDay("2026-08-01", "2026-07-31T21:00:00.000Z"), true);
  check("Kiritimati (+14): still a day ahead",
    namesDay("2026-08-01", "2026-07-31T10:00:00.000Z"), true);
  check("Los Angeles (-07): local date behind the instant",
    namesDay("2026-07-31", "2026-08-01T07:00:00.000Z"), true);
  check("Baker Island (-12): still behind",
    namesDay("2026-07-31", "2026-08-01T12:00:00.000Z"), true);

  // A window that ends NOW stores a mid-day instant, not a midnight — which is
  // the case the first version of this block missed entirely, because every
  // instant in it was midnight-aligned. The digest labels that instant with the
  // local date it belongs to, so the check has to hold without subtracting a day.
  check("a mid-day instant, named by its own UTC date",
    namesDay("2026-09-15", "2026-09-15T11:30:00.000Z"), true);
  check("Beirut (+03) naming the same mid-day moment",
    namesDay("2026-09-15", "2026-09-15T08:30:00.000Z"), true);
  check("Kiritimati (+14) naming it from the previous UTC day",
    namesDay("2026-09-15", "2026-09-14T21:30:00.000Z"), true);
  check("Los Angeles (-07) naming it from the next UTC day",
    namesDay("2026-09-15", "2026-09-16T04:30:00.000Z"), true);
  check("a mid-day instant two days out is still refused",
    namesDay("2026-09-17", "2026-09-15T11:30:00.000Z"), false);

  // And it still refuses a digest for a different window: the windows on offer
  // start at the first of a month, so their starts are weeks apart.
  check("a month early is refused", namesDay("2026-07-01", "2026-08-01T00:00:00.000Z"), false);
  check("a month late is refused", namesDay("2026-09-01", "2026-08-01T00:00:00.000Z"), false);
  check("two days out is refused", namesDay("2026-08-03", "2026-08-01T00:00:00.000Z"), false);

  // Anything that is not a date the device wrote is not a date.
  check("a non-string claim is refused", namesDay(20260801, "2026-08-01T00:00:00.000Z"), false);
  check("a missing claim is refused", namesDay(undefined, "2026-08-01T00:00:00.000Z"), false);
  check("an unparseable instant is refused", namesDay("2026-08-01", "not a date"), false);
}

// ---------------------------------------------------------------- retry ----
async function verifyRetryClassification() {
  console.log("\ngenerate-review — what is worth retrying");
  const { isOverloaded, isModelUnavailable } = await loadRegion(
    "supabase/functions/generate-review/index.ts",
    ["isOverloaded", "isModelUnavailable"],
  );

  // The real thing, verbatim from a failed generation on 2026-09-15. Getting
  // this wrong is not academic: classed as a name problem it would walk the
  // whole candidate list pointlessly, and classed as neither it gives up on the
  // first spike and spends one of the review's three attempts.
  const REAL_503 = String.raw`{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}`;
  check("the 503 Google actually sent reads as busy", isOverloaded(REAL_503), true);
  check("…and not as a bad model name", isModelUnavailable(REAL_503), false);

  check("an overloaded 503 reads as busy",
    isOverloaded(new Error("got status: 503 Service Unavailable. The model is overloaded.")), true);
  check("a rate limit reads as busy",
    isOverloaded(new Error("429 RESOURCE_EXHAUSTED: quota exceeded")), true);

  // A retired or misspelled id: walk to the next candidate, do not wait.
  const RETIRED = String.raw`{"error":{"code":404,"message":"This model models/gemini-2.5-pro is no longer available to new users.","status":"NOT_FOUND"}}`;
  check("a retired model reads as a name problem", isModelUnavailable(RETIRED), true);
  check("…and not as busy", isOverloaded(RETIRED), false);
  check("an unknown model name reads as a name problem",
    isModelUnavailable(new Error("Unexpected model name format: gemini-nope")), true);

  // Neither: the same failure on every model, so raise it at once.
  for (const [what, message] of [
    ["a bad key", "API key not valid. Please pass a valid API key."],
    ["a safety block", "Candidate was blocked due to SAFETY"],
    ["a malformed request", "400 INVALID_ARGUMENT: request contains an invalid argument"],
  ]) {
    check(`${what} is neither busy nor a name problem`,
      isOverloaded(new Error(message)) || isModelUnavailable(new Error(message)), false);
  }
}

// --------------------------------------------------------------- numbers ----
async function verifyNumberGuard() {
  console.log("\ngenerate-review — the no-invented-amounts guard");
  const { collectAmounts, collectNumbers, unsupportedAmounts } = await loadRegion(
    "supabase/functions/generate-review/index.ts",
    ["collectAmounts", "collectNumbers", "unsupportedAmounts"],
  );

  // Shaped like a real digest: every amount carries the string the app prints,
  // alongside the raw cents and the counts that must NOT become quotable amounts.
  const digest = {
    version: 2,
    period: { label: "June 2026 – August 2026", from: "2026-06-01", to: "2026-08-31", days: 92 },
    totals: {
      spent: { cents: 124050, display: "$1,240.50" },
      spendCount: 41,
      dailyAverage: { cents: 1348, display: "$13.48" },
    },
    coverage: { days: 92, daysLogged: 41, coveragePct: 44.6 },
    categories: [
      { label: "Food", spent: { cents: 47200, display: "$472.00" }, count: 22, sharePct: 38.1 },
    ],
    largestExpenses: [
      { date: "2026-07-04", category: "Fun", amount: { cents: 9000, display: "$90.00" } },
    ],
  };
  const amounts = new Set();
  collectAmounts(digest, amounts);
  const numbers = new Set();
  collectNumbers(digest, numbers);
  const bad = (text) => unsupportedAmounts(text, amounts, numbers);
  const clean = (text) => bad(text).length === 0;

  console.log("  amounts the device computed:");
  check("an amount copied exactly passes", clean("You spent $1,240.50 over the period."), true);
  check("the same amount without its symbol passes", clean("That is 1,240.50 in all."), true);
  check("a category total passes", clean("Food came to $472.00 across 22 entries."), true);
  check("several real amounts in one sentence pass",
    clean("Of $1,240.50, Food was $472.00 and the largest single entry $90.00."), true);

  console.log("  amounts it did not:");
  check("one changed digit is caught", clean("You spent $1,240.51."), false);
  check("an absent amount is caught", clean("You spent $999.00 on coffee."), false);
  check("a total the model added up itself is caught",
    clean("Food and fun together came to $562.00."), false);
  check("a rounded version of a real amount is caught", clean("You spent about $1,240.00."), false);
  // The pool used to hold every number in the digest, so a raw `cents` field
  // could be printed as if it were an amount.
  check("a raw cents field printed as money is caught", clean("You spent $124050."), false);
  check("another raw cents field is caught", clean("Food came to $47200."), false);
  // These forms used not to be tokenized at all, so nothing checked them.
  check("a trailing currency code is caught", clean("Rent took 1200 USD."), false);
  check("a trailing currency symbol is caught", clean("Flights were 1200€."), false);
  check("a bare four-digit amount is caught", clean("Food came to 2400 last month."), false);

  console.log("  counts, percentages and dates are not amounts:");
  check("counts are left alone", clean("You logged 41 expenses across 92 days."), true);
  check("percentages are left alone", clean("Food was 38.1% of it."), true);
  check("a date is left alone", clean("The biggest was on 2026-07-04."), true);
  check("a year in prose is left alone", clean("Through the summer of 2026."), true);
  check("two years in prose are left alone", clean("From 2025 into 2026."), true);
  check("small integers are left alone", clean("3 of your 5 biggest were food."), true);
  check("a large count that IS in the digest passes",
    clean("Across 124050 cents of spending."), true);
  // A comma-grouped integer is ambiguous — "1,234 entries" is a truthful count —
  // so it may come from either pool. A separator-formatted count that IS in the
  // digest must not be thrown away as an invented amount.
  check("a separator-formatted count in the digest passes",
    unsupportedAmounts(
      "You logged 1,234 expenses.",
      amounts,
      new Set([...numbers, "1234"]),
    ).length === 0, true);
  check("a separator-formatted number in NEITHER pool is caught",
    clean("You logged 9,876 expenses."), false);
  check("two decimals without a symbol are still held strictly",
    clean("It came to 562.00 in all."), false);

  console.log("  a month-over-month decrease:");
  // The digest holds a decrease as a negative percentage; a truthful sentence
  // about it can only ever quote the unsigned figure, because the token matcher
  // starts at the first digit.
  const down = { changePct: -53.3, last: { cents: 22000, display: "$220.00" } };
  const downAmounts = new Set();
  const downNumbers = new Set();
  collectAmounts(down, downAmounts);
  collectNumbers(down, downNumbers);
  check("a decrease quoted without its minus passes",
    unsupportedAmounts("Food spending fell 53.3% from June to August.", downAmounts, downNumbers).length === 0, true);
  check("the signed form passes too",
    unsupportedAmounts("Food is down -53.3% on the window.", downAmounts, downNumbers).length === 0, true);
  check("an invented percentage is still caught",
    unsupportedAmounts("Food spending fell 61.4%.", downAmounts, downNumbers).length === 0, false);

  console.log("  other currencies:");
  const lbp = new Set();
  const lbpNumbers = new Set();
  collectAmounts({ spent: { cents: 8950000, display: "LL 89,500" } }, lbp);
  collectNumbers({ spent: { cents: 8950000, display: "LL 89,500" } }, lbpNumbers);
  check("a letter-symbol currency passes",
    unsupportedAmounts("You spent LL 89,500 this month.", lbp, lbpNumbers).length === 0, true);
  check("a wrong letter-symbol amount is caught",
    unsupportedAmounts("You spent LL 95,000 this month.", lbp, lbpNumbers).length === 0, false);
}

// -------------------------------------------------------- the findings ----
// The whole-review guard, which is a different claim from the token guard above.
//
// A review is now a short set of findings in which EVERY NUMERAL lives in
// one field, `evidence[].value`. That is what makes the numbers guarantee
// airtight rather than best-effort: the token scan above can only see decimals,
// comma-grouped numbers and runs of four or more digits, so "up 30%",
// "3 times" and "12 days" were invisible to it and a model could state any of
// them, wrongly, and ship. With the digits confined, prose is checked by "does
// it contain a digit at all" and evidence by exact membership.
async function verifyFindingsGuard() {
  console.log("\ngenerate-review — the findings guard");
  const { collectAmounts, collectNumbers, collectLabels, reviewProblems, parseReview, clamp } =
    await loadRegion("supabase/functions/generate-review/index.ts", [
      "collectAmounts",
      "collectNumbers",
      "collectLabels",
      "reviewProblems",
      "parseReview",
      "clamp",
    ]);

  const digest = {
    version: 2,
    period: { label: "Recent months · June 2026 – September 2026", days: 92, months: 4 },
    totals: {
      spent: { cents: 124050, display: "$1,240.50" },
      spendCount: 41,
      dailyAverage: { cents: 1348, display: "$13.48" },
    },
    saving: {
      intoSafe: { cents: 30000, display: "$300.00" },
      netIntoSafe: { cents: 30000, display: "$300.00" },
      savedSharePct: 18.4,
      leftOverSharePct: 22.1,
    },
    coverage: { days: 92, daysLogged: 41, coveragePct: 44.6, longestGapDays: 12 },
    categories: [
      { id: "food", label: "Food", spent: { cents: 47200, display: "$472.00" }, sharePct: 38.1 },
    ],
    subcategories: [
      { id: "food", label: "Food · Delivery", spent: { cents: 21000, display: "$210.00" } },
    ],
  };
  const amounts = new Set();
  collectAmounts(digest, amounts);
  const numbers = new Set();
  collectNumbers(digest, numbers);
  const labels = new Set();
  collectLabels(digest, labels);

  const finding = (over = {}) => ({
    kind: "improve",
    basis: "logged",
    title: "Delivery is the line to hold down",
    detail: "It carries about a fifth of everything you spent, and the cheaper mode of the same thing sits beside it.",
    evidence: [{ label: "Delivery", value: "$210.00" }],
    category: "Food · Delivery",
    ...over,
  });
  const review = (over = {}) => ({
    version: 2,
    headline: "Steady months, with delivery climbing",
    standing: "steady",
    findings: [finding()],
    blindSpots: ["Nearly half the days have nothing logged."],
    ...over,
  });
  const ok = (r) => reviewProblems(r, amounts, numbers, labels).length === 0;

  console.log("  a clean review:");
  check("passes", ok(review()), true);
  check("an evidence value copied exactly passes",
    ok(review({ findings: [finding({ evidence: [{ label: "Spent", value: "$1,240.50" }] })] })), true);
  check("a percentage from the digest passes",
    ok(review({ findings: [finding({ evidence: [{ label: "Share", value: "38.1%" }] })] })), true);
  check("a saving figure passes",
    ok(review({ findings: [finding({ evidence: [{ label: "Put away", value: "$300.00" }] })] })), true);
  check("a small day count that IS in the digest passes",
    ok(review({ findings: [finding({ evidence: [{ label: "Longest gap", value: "12 days" }] })] })), true);
  check("a finding about the whole window needs no category",
    ok(review({ findings: [finding({ category: undefined })] })), true);

  console.log("  the digit ban on prose:");
  check("a digit in the headline is caught",
    ok(review({ headline: "Spending up 12% on the quarter" })), false);
  check("a digit in a finding title is caught",
    ok(review({ findings: [finding({ title: "Delivery took 38.1% of it" })] })), false);
  check("a digit in a finding detail is caught",
    ok(review({ findings: [finding({ detail: "It ran at 3 times the grocery rate." })] })), false);
  check("a digit in an evidence label is caught",
    ok(review({ findings: [finding({ evidence: [{ label: "Top 3", value: "$210.00" }] })] })), false);
  check("a digit in a blind spot is caught",
    ok(review({ blindSpots: ["Only 41 expenses to read."] })), false);
  check("the same claims spelled as words pass",
    ok(review({
      headline: "Steady months, with delivery climbing",
      findings: [finding({ detail: "It ran at about three times the grocery rate." })],
      blindSpots: ["Nearly half the days have nothing logged."],
    })), true);

  console.log("  evidence values the digest does not support:");
  check("one changed digit is caught",
    ok(review({ findings: [finding({ evidence: [{ label: "Delivery", value: "$210.50" }] })] })), false);
  check("a raw cents field printed as money is caught",
    ok(review({ findings: [finding({ evidence: [{ label: "Spent", value: "$124050" }] })] })), false);
  check("an invented percentage is caught",
    ok(review({ findings: [finding({ evidence: [{ label: "Share", value: "44%" }] })] })), false);
  // THE HOLE THE DIGIT BAN CLOSES. A small bare integer is invisible to
  // NUMERIC_TOKEN, so the prose scan could never have judged this one.
  check("a small count NOT in the digest is caught",
    ok(review({ findings: [finding({ evidence: [{ label: "Gap", value: "7 days" }] })] })), false);
  check("a made-up total is caught",
    ok(review({ findings: [finding({ evidence: [{ label: "Together", value: "$682.00" }] })] })), false);

  console.log("  categories must be lines the reader actually has:");
  check("a category label from the digest passes",
    ok(review({ findings: [finding({ category: "Food" })] })), true);
  check("a month label from the digest passes",
    ok(review({ findings: [finding({ category: "Recent months · June 2026 – September 2026" })] })), true);
  check("an invented category is caught",
    ok(review({ findings: [finding({ category: "Dining out" })] })), false);

  console.log("  parseReview clamps verbosity and throws only on shape:");
  const long = "x".repeat(400);
  check("a long detail is cut, not rejected",
    parseReview(review({ findings: [finding({ detail: long })] })).findings[0].detail.length <= 150,
    true);
  check("a long headline is cut", parseReview(review({ headline: long })).headline.length <= 60, true);
  check("clamp cuts at a word boundary", clamp("the quick brown fox jumped", 18), "the quick brown");
  check("clamp leaves a short string alone", clamp("short", 18), "short");
  // An amount cut at a word boundary would be a DIFFERENT amount, so evidence
  // values are hard-truncated and left for the guard to reject instead.
  check("an evidence value is not word-clamped",
    parseReview(review({ findings: [finding({ evidence: [{ label: "V", value: "$1,240,500.00 and more besides" }] })] }))
      .findings[0].evidence[0].value, "$1,240,500.00 and more b");
  check("a finding that clamps to nothing is dropped, not fatal",
    parseReview(review({ findings: [finding({ title: "   " }), finding()] })).findings.length, 1);
  check("a missing headline throws", (() => {
    try { parseReview(review({ headline: 42 })); return false; } catch { return true; }
  })(), true);
  check("no findings at all throws", (() => {
    try { parseReview(review({ findings: [] })); return false; } catch { return true; }
  })(), true);
  check("a finding missing its evidence array throws", (() => {
    try { parseReview(review({ findings: [finding({ evidence: undefined })] })); return false; }
    catch { return true; }
  })(), true);
  check("a basis the model omitted defaults rather than throwing",
    parseReview(review({ findings: [finding({ basis: undefined })] })).findings[0].basis, "logged");
}

await verifyWebhookSignatures();
await verifyWindowCheck();
await verifyRetryClassification();
await verifyNumberGuard();
await verifyFindingsGuard();

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(`\n${failures.map((f) => `  ✗  ${f}`).join("\n")}`);
  process.exit(1);
}
