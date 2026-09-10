// Display + coloring helpers. Every money sign/color in the UI should come from
// here so styling stays consistent (see docs/DESIGN_SYSTEM.md).
//
// Amounts are stored as integer "cents" (hundredths) of the user's home
// currency, whatever that currency is; the formatters take the currency code so
// a EUR home reads "€12.50" and an LBP home "LL 89,500".
import { currencyInfo } from "@/lib/currency";

const numberFormatters = new Map<number, Intl.NumberFormat>();

function numberFormatter(decimals: number): Intl.NumberFormat {
  let f = numberFormatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormatters.set(decimals, f);
  }
  return f;
}

// "$12.50" and "€12.50" but "LL 89,500" and "CHF 12.50": a symbol made of
// letters gets a space so it doesn't run into the number.
function prefixFor(symbol: string): string {
  return /^\p{L}+$/u.test(symbol) ? `${symbol} ` : symbol;
}

/** The currency's symbol as it goes in front of a number: "$", "€", "LL ". */
export function symbolPrefix(currency: string): string {
  return prefixFor(currencyInfo(currency).symbol);
}

/**
 * Where to draw the currency from: its symbol ("$", "LL ") or, for a medium
 * that can't render every symbol (the PDF), its code ("USD ").
 */
export type SymbolStyle = "symbol" | "code";

/** Format home cents as "$12.50" / "€12.50" / "LL 89,500" (no sign). */
export function formatCents(
  cents: number,
  currency: string,
  style: SymbolStyle = "symbol",
): string {
  const info = currencyInfo(currency);
  const prefix = style === "code" ? `${info.code} ` : prefixFor(info.symbol);
  return `${prefix}${numberFormatter(info.decimals).format(Math.abs(cents) / 100)}`;
}

/** Format a signed net total as "$87.50" (positive) / "-$12.50" (negative). */
export function formatSignedCents(
  cents: number,
  currency: string,
  style: SymbolStyle = "symbol",
): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${formatCents(cents, currency, style)}`;
}

/**
 * An obscured amount for a locked device: the currency's symbol in front of a
 * garbled stand-in ("$•••••", "LL a8F2"), so it still reads as money.
 */
export function formatMasked(mask: string, currency: string): string {
  return `${prefixFor(currencyInfo(currency).symbol)}${mask}`;
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

/** Sum transactions into a signed net in home cents. */
export function netCents(
  rows: { is_income: boolean; amount_usd_cents: number }[],
): number {
  return rows.reduce(
    (sum, r) => sum + (r.is_income ? r.amount_usd_cents : -r.amount_usd_cents),
    0,
  );
}
