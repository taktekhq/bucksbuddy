// Putting a name to the charge Dad could only describe.
//
// This closes the one gap the privacy model deliberately opens. Notes never
// leave the device (lib/reportDigest), so the digest carries "a charge of
// $14.99 in Fees, three times, about thirty days apart" and nothing more.
// Dad, working only from that, can say exactly one true thing about it: go and
// find out what it is. He is right to say it — he genuinely cannot see.
//
// The device can. `detectRecurring` (lib/recurring) reads the same charge out
// of the note the reader typed and calls it "Netflix, monthly". The breakdown
// above already prints that under FIXED COSTS. So the answer to Dad's errand is
// sitting on the same screen as the errand, and this module is what carries it
// the last few pixels — ON THIS SIDE of the wire. Nothing new is sent, the
// prompt is unchanged, and a model is never told a merchant's name.
//
// WHAT IT TAKES TO NAME ONE, and why the bar is this high: a wrong name is
// worse than no name. "Go and cancel Netflix" pointed at the gym is a review
// that cannot be trusted again, so every one of these has to hold:
//
//   1. The finding quotes an amount that THE DIGEST ITSELF called a repeating
//      charge. An amount matching some subscription's price by coincidence —
//      a category total, one of the largest expenses — is not grounds. This is
//      also exactly the ground the prompt gives Dad for a "swap" finding, so
//      the two agree on what the finding is about.
//   2. The device has a named recurring payment at that same amount, in that
//      same parent category, going out rather than coming in.
//   3. There is EXACTLY ONE such payment. Two subscriptions at the same price
//      in the same category are indistinguishable from here, and naming either
//      would be a coin toss presented as a fact.
//
// A review opened from the archive is matched against TODAY's figures, which is
// the right failure mode rather than a bug: if the charge still repeats at the
// same price in the same category, the name is still correct; if the price has
// moved since, nothing matches and the finding renders unnamed, exactly as it
// did the day it was written.

import { categoryLabel, splitCategory } from "@/lib/categories";
import type { Currency } from "@/lib/currency";
import { formatCents } from "@/lib/money";
import type { RecurringPayment, RecurringSummary } from "@/lib/recurring";
import type { SpendingDigest } from "@/lib/reportDigest";
import type { ReviewFinding } from "@/types/db";

/** Whitespace and case are not part of a figure. Same rule the guard uses. */
function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

/**
 * The forms of one amount a finding might quote: the string the app prints, and
 * that string without its currency mark.
 *
 * Both, because the generating function accepts both — `collectAmounts` there
 * pools a `display` string and its bare form together, so "14.99" is a valid
 * quote of "$14.99" and either can reach a stored review.
 */
function amountForms(display: string): string[] {
  const text = normalize(display);
  const bare = text.replace(/^[^\d]+/, "");
  return bare === "" || bare === text ? [text] : [text, bare];
}

/** Does `value` quote `display`, in either of the forms above? */
function quotes(value: string, display: string): boolean {
  const seen = normalize(value);
  return amountForms(display).includes(seen);
}

/**
 * The repeating charges this finding is grounded in: the digest's own
 * `repeatedCharges` entries whose amount one of the finding's evidence values
 * quotes.
 *
 * Evidence is the only field that may hold a digit at all (see the prompt's
 * numerals rule), so it is the only place a figure can be read back out of a
 * finding — the prose is guaranteed to have none.
 */
function groundedRepeats(
  finding: ReviewFinding,
  digest: SpendingDigest,
): SpendingDigest["repeatedCharges"] {
  return digest.repeatedCharges.filter((repeat) =>
    finding.evidence.some((figure) => quotes(figure.value, repeat.amount.display)),
  );
}

/** A payment's parent category as the digest labels it — the comparable form. */
function parentLabel(payment: RecurringPayment): string {
  return categoryLabel(splitCategory(payment.category).base);
}

/**
 * The recurring payment this finding is unmistakably about, or null.
 *
 * Null is the common answer and the safe one: most findings are not about a
 * repeating charge at all, and a finding that is can still fail to resolve to
 * exactly one named payment. Callers render the finding unchanged in that case.
 */
export function namedCharge(
  finding: ReviewFinding,
  digest: SpendingDigest,
  recurring: RecurringSummary | null,
  homeCurrency: Currency,
): RecurringPayment | null {
  // Every amount in a masked summary is zero (lib/recurring), so every payment
  // would "match" an amount of zero and the first one would win. Refuse.
  if (recurring === null || recurring.anyMasked) return null;

  const repeats = groundedRepeats(finding, digest);
  if (repeats.length === 0) return null;

  const matches = recurring.payments.filter((payment) => {
    // Income is not something to go and cancel, and Dad's grounds for this kind
    // of finding are spending. A salary landing monthly is not the answer to
    // "find out what that charge is".
    if (payment.isIncome) return false;
    // An unnamed payment names nothing — it would print an empty pill and tell
    // the reader exactly what Dad already told them.
    if (payment.note === null || payment.note.trim() === "") return false;
    const display = formatCents(payment.amountCents, homeCurrency);
    const label = parentLabel(payment);
    return repeats.some(
      (repeat) =>
        normalize(repeat.category) === normalize(label) &&
        quotes(display, repeat.amount.display),
    );
  });

  if (matches.length !== 1) return null;
  const only = matches[0];

  // A finding may file itself against a category (the guard checks it is one the
  // digest carries). When it does, it has to be this payment's category — a
  // finding about Fees must not be answered with the payment in Health.
  if (
    finding.category != null &&
    normalize(finding.category) !== normalize(parentLabel(only))
  ) {
    return null;
  }
  return only;
}
