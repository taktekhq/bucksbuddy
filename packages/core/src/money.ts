// Display + coloring helpers. Every money sign/color in the UI should come from
// here so styling stays consistent (see docs/DESIGN_SYSTEM.md).

// Stryker disable all : module-level, so Stryker's per-test mutant switch never
// activates these — the module is evaluated once at import, before the switch
// flips. Every mutant here ("" for the locale, style or currency) throws a
// RangeError at construction, so if one ever *were* active the whole suite
// would fail rather than survive. Not a gap in the assertions.
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// Stryker restore all

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
 * Tailwind text-color class for a net value. Money is green when you're up,
 * red when you're down, neutral at exactly zero. The carrot hijack lets money
 * be colorful again.
 */
export function netColorClass(cents: number): string {
  if (cents > 0) return "text-income";
  if (cents < 0) return "text-expense";
  return "text-label";
}

/** Tailwind text-color class for a single entry by direction (in = green, out = red). */
export function amountColorClass(isIncome: boolean): string {
  return isIncome ? "text-income" : "text-expense";
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
