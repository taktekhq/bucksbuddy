// All money math lives here. The DB source of truth is an integer count of
// hundredths of the user's HOME currency (the column is still called
// `amount_usd_cents` from the days USD was the only home currency; read it as
// "home cents"). We only round at the conversion boundary (Math.round), never
// store floats.
//
// A user has one home currency (what totals are shown in) and any number of
// secondary currencies, each with a rate expressed as "units of that currency
// per 1 unit of home" — the same direction as the old "LBP per $1".
import type { Profile } from "@/types/db";

export type CurrencyInfo = {
  code: string;
  name: string;
  symbol: string;
  // Fraction digits shown for this currency (LBP and JPY have none).
  decimals: number;
};

// The currencies a user can pick from. Curated rather than the full ISO list so
// the picker stays short; add a row here to support another one. Symbols are
// the familiar short forms — where a currency has no symbol of its own the
// code doubles as one.
const LIST = [
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "LBP", name: "Lebanese Pound", symbol: "LL", decimals: 0 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimals: 2 },
  { code: "QAR", name: "Qatari Riyal", symbol: "QAR", decimals: 2 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KWD", decimals: 3 },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BHD", decimals: 3 },
  { code: "OMR", name: "Omani Rial", symbol: "OMR", decimals: 3 },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JOD", decimals: 3 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "CN¥", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
  { code: "PLN", name: "Polish Złoty", symbol: "zł", decimals: 2 },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", decimals: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
] as const satisfies readonly CurrencyInfo[];

export type Currency = (typeof LIST)[number]["code"];

export const CURRENCIES: readonly CurrencyInfo[] = LIST;

/** A secondary currency and its rate: units of `code` per 1 unit of home. */
export type CurrencyRate = { code: Currency; rate: number };

export type CurrencySettings = {
  homeCurrency: Currency;
  currencies: CurrencyRate[];
};

export const DEFAULT_HOME_CURRENCY: Currency = "USD";
export const DEFAULT_LBP_PER_USD = 89500;
// What a fresh account gets: USD at home with LBP alongside, the way the app
// always worked. Kept in step with the DB default in 0007_currencies.sql.
export const DEFAULT_CURRENCIES: readonly CurrencyRate[] = [
  { code: "LBP", rate: DEFAULT_LBP_PER_USD },
];

const BY_CODE = new Map<string, CurrencyInfo>(LIST.map((c) => [c.code, c]));

/**
 * Everything we know about a currency. A code we don't list (an old row, a
 * hand-edited profile) still formats sensibly: its code stands in for the
 * symbol, with two decimals.
 */
export function currencyInfo(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? { code, name: code, symbol: code, decimals: 2 };
}

export function currencySymbol(code: string): string {
  return currencyInfo(code).symbol;
}

export function isCurrency(code: unknown): code is Currency {
  return typeof code === "string" && BY_CODE.has(code);
}

/**
 * The rate to convert `code` into home: 1 for the home currency itself, the
 * configured rate for a secondary, or null when the currency isn't set up.
 */
export function rateFor(
  code: string,
  homeCurrency: string,
  currencies: readonly CurrencyRate[],
): number | null {
  if (code === homeCurrency) return 1;
  return currencies.find((c) => c.code === code)?.rate ?? null;
}

/**
 * Convert an as-entered amount to normalized home cents.
 * @param amount The numeric amount as the user typed it (e.g. 12.5 or 890000)
 * @param rate   Units of the entered currency per 1 unit of home (1 for home)
 */
export function toHomeCents(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round((amount / rate) * 100);
}

/** Parse a numpad display string ("12.50", "", ".") into a non-negative number. */
export function parseAmountString(display: string): number {
  if (!display || display === ".") return 0;
  const n = Number.parseFloat(display);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Parse a typed exchange rate ("89500", "0.92"); null unless it's positive. */
export function parseRateString(display: string): number | null {
  const n = Number.parseFloat(display);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Rates derived by arithmetic (see switchHomeCurrency) are trimmed to eight
// significant digits so they read cleanly in the settings field instead of
// trailing off into float noise.
function tidyRate(rate: number): number {
  return Number(rate.toPrecision(8));
}

/**
 * Move the home currency to `next`. The stored amounts are NOT converted — the
 * numbers stay as they are and are simply read in the new currency (see the
 * Settings copy). The rate list is re-based when it can be: if `next` was a
 * secondary with rate r, every other rate divides by r and the old home joins
 * the list at 1/r. Otherwise there's nothing to derive the new rates from, so
 * the list is cleared for the user to set up again.
 */
export function switchHomeCurrency(
  settings: CurrencySettings,
  next: Currency,
): CurrencySettings {
  const { homeCurrency, currencies } = settings;
  if (next === homeCurrency) return settings;
  const pivot = currencies.find((c) => c.code === next);
  if (!pivot) return { homeCurrency: next, currencies: [] };
  const rebased: CurrencyRate[] = [
    { code: homeCurrency, rate: tidyRate(1 / pivot.rate) },
    ...currencies
      .filter((c) => c.code !== next)
      .map((c) => ({ code: c.code, rate: tidyRate(c.rate / pivot.rate) })),
  ];
  return { homeCurrency: next, currencies: rebased };
}

/**
 * The currency settings held in a profile row, with the fallbacks for a
 * database that predates them: a profile from before 0007_currencies.sql has
 * only `lbp_per_usd`, and a missing profile means the defaults. Junk in the
 * jsonb (a code we don't know, a non-positive rate, the home currency itself)
 * is dropped rather than trusted.
 */
export function currencySettingsFromProfile(
  profile: Partial<Profile> | null | undefined,
): CurrencySettings {
  const homeCurrency = isCurrency(profile?.home_currency)
    ? profile.home_currency
    : DEFAULT_HOME_CURRENCY;
  const raw = profile?.currencies;
  if (!Array.isArray(raw)) {
    // Pre-0007 profile: carry the old single LBP rate across.
    const lbp = profile?.lbp_per_usd;
    const rate = typeof lbp === "number" && lbp > 0 ? lbp : DEFAULT_LBP_PER_USD;
    return { homeCurrency, currencies: [{ code: "LBP", rate }] };
  }
  const seen = new Set<string>([homeCurrency]);
  const currencies: CurrencyRate[] = [];
  for (const item of raw as unknown[]) {
    const entry = item as { code?: unknown; rate?: unknown };
    if (!isCurrency(entry?.code) || seen.has(entry.code)) continue;
    if (typeof entry.rate !== "number" || !(entry.rate > 0)) continue;
    seen.add(entry.code);
    currencies.push({ code: entry.code, rate: entry.rate });
  }
  return { homeCurrency, currencies };
}
