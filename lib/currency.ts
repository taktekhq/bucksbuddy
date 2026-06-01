// All money math lives here. The DB source of truth is integer USD cents.
// We only round at the conversion boundary (Math.round), never store floats.

export type Currency = "USD" | "LBP";

export const DEFAULT_LBP_PER_USD = 89000;

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
  if (!Number.isFinite(amount) || amount < 0) return 0;
  if (currency === "USD") {
    return Math.round(amount * 100);
  }
  const rate = lbpPerUsd > 0 ? lbpPerUsd : DEFAULT_LBP_PER_USD;
  return Math.round((amount / rate) * 100);
}

/** Parse a numpad display string ("12.50", "", ".") into a non-negative number. */
export function parseAmountString(display: string): number {
  if (!display || display === ".") return 0;
  const n = Number.parseFloat(display);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
