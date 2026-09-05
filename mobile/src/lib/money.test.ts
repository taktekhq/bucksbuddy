// Adapted from the web's src/lib/money.test.ts. The class helpers below are
// the web's assertions verbatim (minus the vitest import); the hex helpers are
// this app's addition, for the places React Native takes a color as a prop.
import {
  amountColor,
  amountColorClass,
  formatSignedUsdCents,
  formatUsdCents,
  netCents,
  netColor,
  netColorClass,
} from "@/lib/money";
import { colors } from "@/lib/theme";

describe("formatUsdCents", () => {
  it("formats cents as USD with no sign", () => {
    expect(formatUsdCents(1250)).toBe("$12.50");
    expect(formatUsdCents(-1250)).toBe("$12.50"); // abs value
    expect(formatUsdCents(0)).toBe("$0.00");
  });

  it("always shows two fraction digits and groups thousands", () => {
    expect(formatUsdCents(100)).toBe("$1.00");
    expect(formatUsdCents(123456789)).toBe("$1,234,567.89");
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

describe("netColor", () => {
  it("is the same three-way split as netColorClass, as a hex", () => {
    expect(netColor(5)).toBe(colors.income);
    expect(netColor(-5)).toBe(colors.expense);
    expect(netColor(0)).toBe(colors.label);
  });
});

describe("amountColor", () => {
  it("is amountColorClass as a hex", () => {
    expect(amountColor(true)).toBe(colors.income);
    expect(amountColor(false)).toBe(colors.expense);
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

  it("can go negative", () => {
    expect(netCents([{ is_income: false, amount_usd_cents: 500 }])).toBe(-500);
  });
});
