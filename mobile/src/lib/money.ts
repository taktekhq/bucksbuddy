// Display + coloring helpers. Every money sign/color in the UI should come from
// here so styling stays consistent (see docs/DESIGN_SYSTEM.md).
import { colors } from "@/lib/theme";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format USD cents as "$12.50" (no sign). */
export function formatUsdCents(cents: number): string {
  return usdFormatter.format(Math.abs(cents) / 100);
}

/** Format a signed net total as "$87.50" (positive) / "-$12.50" (negative). */
export function formatSignedUsdCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${formatUsdCents(cents)}`;
}

/**
 * Text color for a net value. Money is green when you're up, red when you're
 * down, neutral at exactly zero. (The web's `netColorClass`, as a hex.)
 */
export function netColor(cents: number): string {
  if (cents > 0) return colors.income;
  if (cents < 0) return colors.expense;
  return colors.label;
}

/** Text color for a single entry by direction (in = green, out = red). */
export function amountColor(isIncome: boolean): string {
  return isIncome ? colors.income : colors.expense;
}

/** Sum transactions into a signed net in USD cents. */
export function netCents(
  rows: { is_income: boolean; amount_usd_cents: number }[],
): number {
  return rows.reduce(
    (sum, r) => sum + (r.is_income ? r.amount_usd_cents : -r.amount_usd_cents),
    0,
  );
}
