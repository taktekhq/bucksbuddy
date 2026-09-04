// All money math lives here. The DB source of truth is integer USD cents.
// We only round at the conversion boundary (Math.round), never store floats.

export type Currency = "USD" | "LBP";

export const DEFAULT_LBP_PER_USD = 89500;

/**
 * Convert an as-entered amount (in `currency`) to normalized USD integer cents.
 * @param amount    The numeric amount as the user typed it (e.g. 12.5 or 890000)
 * @param currency  "USD" or "LBP"
 * @param lbpPerUsd LBP per 1 USD (only used for LBP)
 */
export function toUsdCents(
  amount: number,
  currency: Currency,
  lbpPerUsd: number,
): number {
  // Stryker disable next-line EqualityOperator : equivalent — at exactly zero
  // both the guard and the conversion below yield 0 cents.
  if (!Number.isFinite(amount) || amount < 0) return 0;
  if (currency === "USD") {
    return Math.round(amount * 100);
  }
  const rate = lbpPerUsd > 0 ? lbpPerUsd : DEFAULT_LBP_PER_USD;
  return Math.round((amount / rate) * 100);
}

/** Parse a numpad display string ("12.50", "", ".") into a non-negative number. */
export function parseAmountString(display: string): number {
  // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral,EqualityOperator : the
  // guard is redundant — parseFloat already yields NaN for "" and ".", which
  // the check below turns into 0. Verified equivalent across empty, partial,
  // signed and malformed inputs. Kept because it names the numpad's two empty
  // states, which is not obvious from `Number.parseFloat` alone.
  if (!display || display === ".") return 0;
  const n = Number.parseFloat(display);
  // Stryker disable next-line EqualityOperator : equivalent — at exactly zero
  // both branches return 0.
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
