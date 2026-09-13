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
    version: 1,
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

await verifyWebhookSignatures();
await verifyNumberGuard();

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(`\n${failures.map((f) => `  ✗  ${f}`).join("\n")}`);
  process.exit(1);
}
