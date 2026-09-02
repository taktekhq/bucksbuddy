// Gold is tracked in grams. Conversion is optional eye-candy: we try a free,
// keyless spot-price API and degrade silently if it's unavailable or blocked
// (CORS, offline, rate limits). Grams remain the source of truth either way.

const TROY_OUNCE_IN_GRAMS = 31.1034768;

// Stryker disable all : module-level (see the note in money.ts). The
// ObjectLiteral mutant is separately equivalent: {} formats identically here,
// because these options restate Intl's own decimal defaults. They stay for
// intent, and to pin the behaviour if those defaults ever move.
const gramsFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});
// Stryker restore all

/** "5 g", "2.5 g", "0.125 g". */
export function formatGrams(grams: number): string {
  return `${gramsFormatter.format(grams)} g`;
}

/**
 * Best-effort live gold price in USD per gram, or null if it can't be fetched.
 * api.gold-api.com is keyless and CORS-friendly; price is USD per troy ounce.
 */
export async function fetchGoldUsdPerGram(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { price?: number };
    // Stryker disable next-line OptionalChaining : equivalent — a null body
    // gives NaN here and returns null below, while `data.price` would throw and
    // return null from the catch. Same output, so no test can separate them.
    const perOunce = Number(data?.price);
    if (!Number.isFinite(perOunce) || perOunce <= 0) return null;
    return perOunce / TROY_OUNCE_IN_GRAMS;
  } catch {
    return null;
  }
}
