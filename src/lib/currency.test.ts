import { describe, it, expect } from "vitest";
import {
  CURRENCIES,
  DEFAULT_LBP_PER_USD,
  currencyInfo,
  currencySettingsFromProfile,
  currencySymbol,
  isCurrency,
  parseAmountString,
  parseRateString,
  rateFor,
  switchHomeCurrency,
  toHomeCents,
  type Currency,
  type CurrencyRate,
} from "@/lib/currency";
import type { Profile } from "@/types/db";

describe("currencyInfo", () => {
  it("knows the listed currencies", () => {
    expect(currencyInfo("USD")).toEqual({
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      decimals: 2,
    });
    expect(currencySymbol("LBP")).toBe("LL");
    expect(currencyInfo("LBP").decimals).toBe(0);
  });

  it("falls back to the code for one it doesn't list", () => {
    expect(currencyInfo("XXX")).toEqual({
      code: "XXX",
      name: "XXX",
      symbol: "XXX",
      decimals: 2,
    });
  });

  it("lists each code once", () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("EUR");
  });
});

describe("isCurrency", () => {
  it("accepts listed codes and nothing else", () => {
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("XXX")).toBe(false);
    expect(isCurrency(42)).toBe(false);
    expect(isCurrency(undefined)).toBe(false);
  });
});

describe("rateFor", () => {
  const list: CurrencyRate[] = [{ code: "LBP", rate: 89500 }];

  it("is 1 for the home currency", () => {
    expect(rateFor("USD", "USD", list)).toBe(1);
  });

  it("reads a secondary currency's rate", () => {
    expect(rateFor("LBP", "USD", list)).toBe(89500);
  });

  it("is null for a currency that isn't set up", () => {
    expect(rateFor("EUR", "USD", list)).toBeNull();
  });
});

describe("toHomeCents", () => {
  it("converts a home-currency amount to integer cents with rounding", () => {
    expect(toHomeCents(12.5, 1)).toBe(1250);
    expect(toHomeCents(12.005, 1)).toBe(1201); // rounds
  });

  it("divides by the rate for a secondary currency", () => {
    expect(toHomeCents(89500, 89500)).toBe(100);
    expect(toHomeCents(179000, 89500)).toBe(200);
    expect(toHomeCents(0.92, 0.92)).toBe(100); // €0.92 at 0.92 EUR per $1
  });

  it("returns 0 for non-finite or negative amounts", () => {
    expect(toHomeCents(Number.NaN, 1)).toBe(0);
    expect(toHomeCents(Infinity, 1)).toBe(0);
    expect(toHomeCents(-1, 1)).toBe(0);
  });

  it("returns 0 for a rate that can't convert", () => {
    expect(toHomeCents(100, 0)).toBe(0);
    expect(toHomeCents(100, -5)).toBe(0);
    expect(toHomeCents(100, Number.NaN)).toBe(0);
  });
});

describe("parseAmountString", () => {
  it("returns 0 for empty or a lone dot", () => {
    expect(parseAmountString("")).toBe(0);
    expect(parseAmountString(".")).toBe(0);
  });

  it("parses valid non-negative numbers", () => {
    expect(parseAmountString("12.50")).toBe(12.5);
    expect(parseAmountString("0")).toBe(0);
  });

  it("returns 0 for unparseable or negative input", () => {
    expect(parseAmountString("abc")).toBe(0);
    expect(parseAmountString("-5")).toBe(0);
  });
});

describe("parseRateString", () => {
  it("parses positive numbers, whole or fractional", () => {
    expect(parseRateString("89500")).toBe(89500);
    expect(parseRateString("0.92")).toBe(0.92);
  });

  it("rejects empty, zero, negative and junk", () => {
    expect(parseRateString("")).toBeNull();
    expect(parseRateString(".")).toBeNull();
    expect(parseRateString("0")).toBeNull();
    expect(parseRateString("-1")).toBeNull();
    expect(parseRateString("abc")).toBeNull();
  });
});

describe("switchHomeCurrency", () => {
  const settings = {
    homeCurrency: "USD" as const,
    currencies: [
      { code: "EUR" as const, rate: 0.8 },
      { code: "LBP" as const, rate: 89500 },
    ],
  };

  it("is a no-op for the same home", () => {
    expect(switchHomeCurrency(settings, "USD")).toBe(settings);
  });

  it("re-bases every rate around a secondary that becomes home", () => {
    expect(switchHomeCurrency(settings, "EUR")).toEqual({
      homeCurrency: "EUR",
      currencies: [
        { code: "USD", rate: 1.25 }, // 1 / 0.8
        { code: "LBP", rate: 111875 }, // 89500 / 0.8
      ],
    });
  });

  it("trims derived rates to eight significant digits", () => {
    const next = switchHomeCurrency(
      {
        homeCurrency: "USD",
        currencies: [
          { code: "EUR", rate: 0.92 },
          { code: "LBP", rate: 89500 },
        ],
      },
      "EUR",
    );
    expect(next.currencies).toEqual([
      { code: "USD", rate: 1.0869565 },
      { code: "LBP", rate: 97282.609 },
    ]);
  });

  it("clears the list when the new home has no rate to derive from", () => {
    expect(switchHomeCurrency(settings, "GBP")).toEqual({
      homeCurrency: "GBP",
      currencies: [],
    });
  });
});

describe("currencySettingsFromProfile", () => {
  const defaults = {
    homeCurrency: "USD",
    currencies: [{ code: "LBP", rate: DEFAULT_LBP_PER_USD }],
  };

  it("defaults with no profile at all", () => {
    expect(currencySettingsFromProfile(null)).toEqual(defaults);
    expect(currencySettingsFromProfile(undefined)).toEqual(defaults);
  });

  it("defaults the list when the profile has none, keeping a valid home", () => {
    expect(
      currencySettingsFromProfile({ home_currency: "EUR" } as Partial<Profile>),
    ).toEqual({ homeCurrency: "EUR", currencies: defaults.currencies });
  });

  it("reads the new columns", () => {
    expect(
      currencySettingsFromProfile({
        home_currency: "EUR",
        currencies: [{ code: "USD", rate: 1.08 }],
      }),
    ).toEqual({ homeCurrency: "EUR", currencies: [{ code: "USD", rate: 1.08 }] });
  });

  it("drops junk from the list rather than trusting it", () => {
    const junk = [
      { code: "XXX", rate: 1 }, // not a listed currency
      { code: "USD", rate: 0 }, // non-positive rate
      { code: "USD", rate: "1" }, // rate isn't a number
      { code: "EUR", rate: 1.1 }, // the home currency itself
      { code: "GBP", rate: 0.8 },
      { code: "GBP", rate: 0.9 }, // duplicate
      null,
      5,
    ];
    expect(
      currencySettingsFromProfile({
        home_currency: "EUR",
        currencies: junk as unknown as CurrencyRate[],
      }),
    ).toEqual({ homeCurrency: "EUR", currencies: [{ code: "GBP", rate: 0.8 }] });
  });

  it("falls back to USD for a home currency it doesn't know", () => {
    expect(
      currencySettingsFromProfile({ home_currency: "XXX" as Currency, currencies: [] }),
    ).toEqual({ homeCurrency: "USD", currencies: [] });
  });
});
