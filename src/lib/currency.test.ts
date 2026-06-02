import { describe, it, expect } from "vitest";
import {
  DEFAULT_LBP_PER_USD,
  parseAmountString,
  toUsdCents,
} from "@/lib/currency";

describe("toUsdCents", () => {
  it("converts USD to integer cents with rounding", () => {
    expect(toUsdCents(12.5, "USD", DEFAULT_LBP_PER_USD)).toBe(1250);
    expect(toUsdCents(12.005, "USD", DEFAULT_LBP_PER_USD)).toBe(1201); // rounds
  });

  it("converts LBP to USD cents using the rate", () => {
    expect(toUsdCents(89500, "LBP", 89500)).toBe(100);
    expect(toUsdCents(179000, "LBP", 89500)).toBe(200);
  });

  it("falls back to the default rate when the rate is non-positive", () => {
    expect(toUsdCents(89500, "LBP", 0)).toBe(
      Math.round((89500 / DEFAULT_LBP_PER_USD) * 100),
    );
    expect(toUsdCents(89500, "LBP", -5)).toBe(
      Math.round((89500 / DEFAULT_LBP_PER_USD) * 100),
    );
  });

  it("returns 0 for non-finite or negative amounts", () => {
    expect(toUsdCents(Number.NaN, "USD", DEFAULT_LBP_PER_USD)).toBe(0);
    expect(toUsdCents(Infinity, "USD", DEFAULT_LBP_PER_USD)).toBe(0);
    expect(toUsdCents(-1, "USD", DEFAULT_LBP_PER_USD)).toBe(0);
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
