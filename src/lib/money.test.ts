import { describe, it, expect } from "vitest";
import {
  amountColorClass,
  formatSignedUsdCents,
  formatUsdCents,
  netCents,
  netColorClass,
} from "@/lib/money";

describe("formatUsdCents", () => {
  it("formats cents as USD with no sign", () => {
    expect(formatUsdCents(1250)).toBe("$12.50");
    expect(formatUsdCents(-1250)).toBe("$12.50"); // abs value
    expect(formatUsdCents(0)).toBe("$0.00");
  });
});

describe("formatSignedUsdCents", () => {
  it("prefixes a minus for negatives only", () => {
    expect(formatSignedUsdCents(8750)).toBe("$87.50");
    expect(formatSignedUsdCents(-1250)).toBe("-$12.50");
    expect(formatSignedUsdCents(0)).toBe("$0.00");
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
