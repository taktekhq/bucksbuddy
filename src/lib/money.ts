// Display + coloring helpers. Every money sign/color in the UI should come from
// here so styling stays consistent (see docs/DESIGN_SYSTEM.md).

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

/** Tailwind text-color class for a net value. */
export function netColorClass(cents: number): string {
  return cents < 0 ? "text-expense" : "text-income";
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
