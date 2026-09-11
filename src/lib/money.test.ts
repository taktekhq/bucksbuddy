import { describe, it, expect } from "vitest";
import {
  amountColorClass,
  formatCents,
  formatMasked,
  formatSignedCents,
  netCents,
  netColorClass,
  symbolPrefix,
} from "@/lib/money";

describe("formatCents", () => {
  it("formats home cents with the currency's symbol and no sign", () => {
    expect(formatCents(1250, "USD")).toBe("$12.50");
    expect(formatCents(-1250, "USD")).toBe("$12.50"); // abs value
    expect(formatCents(0, "USD")).toBe("$0.00");
    expect(formatCents(1250, "EUR")).toBe("€12.50");
  });

  it("spaces a lettered symbol and follows the currency's decimals", () => {
    expect(formatCents(8950000, "LBP")).toBe("LL 89,500");
    expect(formatCents(1250, "CHF")).toBe("CHF 12.50");
    expect(formatCents(1250, "KWD")).toBe("KWD 12.500");
    expect(formatCents(1250, "CAD")).toBe("CA$12.50");
  });

  it("can spell the currency by code instead of symbol", () => {
    expect(formatCents(1250, "USD", "code")).toBe("USD 12.50");
    expect(formatCents(1250, "TRY", "code")).toBe("TRY 12.50");
  });

  it("uses the code as the symbol for a currency it doesn't know", () => {
    expect(formatCents(1250, "XXX")).toBe("XXX 12.50");
  });
});

describe("formatSignedCents", () => {
  it("prefixes a minus for negatives only", () => {
    expect(formatSignedCents(8750, "USD")).toBe("$87.50");
    expect(formatSignedCents(-1250, "USD")).toBe("-$12.50");
    expect(formatSignedCents(0, "USD")).toBe("$0.00");
    expect(formatSignedCents(-1250, "EUR")).toBe("-€12.50");
    expect(formatSignedCents(-1250, "USD", "code")).toBe("-USD 12.50");
  });
});

describe("symbolPrefix", () => {
  it("is the bare symbol, spaced when it's letters", () => {
    expect(symbolPrefix("USD")).toBe("$");
    expect(symbolPrefix("EUR")).toBe("€");
    expect(symbolPrefix("LBP")).toBe("LL ");
  });
});

describe("formatMasked", () => {
  it("puts the symbol in front of the obscured stand-in", () => {
    expect(formatMasked("•••••", "USD")).toBe("$•••••");
    expect(formatMasked("a8F2", "LBP")).toBe("LL a8F2");
  });
});

describe("netColorClass", () => {
  it("returns green/red/neutral by sign", () => {
    expect(netColorClass(5)).toBe("text-income");
    expect(netColorClass(-5)).toBe("text-expense");
    expect(netColorClass(0)).toBe("text-label");
  });
});

describe("amountColorClass", () => {
  it("returns income green or expense red", () => {
    expect(amountColorClass(true)).toBe("text-income");
    expect(amountColorClass(false)).toBe("text-expense");
  });
});

describe("netCents", () => {
  it("sums income as positive and expense as negative", () => {
    expect(
      netCents([
        { is_income: true, amount_usd_cents: 1000 },
        { is_income: false, amount_usd_cents: 250 },
        { is_income: true, amount_usd_cents: 50 },
      ]),
    ).toBe(800);
  });

  it("returns 0 for an empty list", () => {
    expect(netCents([])).toBe(0);
  });
});
