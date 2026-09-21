import { describe, it, expect } from "vitest";
import { namedCharge } from "@/lib/reviewNaming";
import { buildDigest, type ReportWindow } from "@/lib/reportDigest";
import { detectRecurring, type RecurringSummary } from "@/lib/recurring";
import type { ReviewFinding } from "@/types/db";
import type { Transaction } from "@/types/db";

// Noon, local, so day gaps are whole numbers wherever this runs.
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

const NOW = new Date(2026, 5, 10, 15); // 10 June 2026
const WINDOW: ReportWindow = {
  id: "last_3_months",
  from: new Date(2026, 2, 1),
  to: NOW,
};

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: "u1",
    is_income: false,
    category: "fees/subscriptions",
    amount_usd_cents: 1599,
    original_currency: "USD",
    original_amount: 15.99,
    rate_used: 1,
    occurred_at: at(2026, 5, 1),
    note: "Netflix",
    created_at: at(2026, 5, 1),
    ...over,
  };
}

/** One entry on the 1st of each of the four months ending June 2026. */
function monthly(over: Partial<Transaction> = {}): Transaction[] {
  return [2, 3, 4, 5].map((month) =>
    tx({ ...over, occurred_at: at(2026, month, 1) }),
  );
}

/** A finding quoting `values` as its evidence. */
function finding(values: string[], over: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    kind: "swap",
    basis: "logged",
    title: "Something repeats in Fees",
    detail: "Go and find out what it is.",
    evidence: values.map((value) => ({ label: "Each time", value })),
    category: null,
    ...over,
  };
}

function setup(rows: Transaction[]) {
  return {
    digest: buildDigest(rows, WINDOW, "USD"),
    recurring: detectRecurring(rows, "u1", NOW),
  };
}

describe("namedCharge", () => {
  it("names the one repeating payment the finding is about", () => {
    const { digest, recurring } = setup(monthly());

    // The device's own two halves agree before anything is matched: the digest
    // saw an amount repeating, and the notes named it.
    expect(digest.repeatedCharges).toContainEqual(
      expect.objectContaining({ category: "Fees", count: 4 }),
    );
    expect(recurring.payments.map((p) => p.note)).toEqual(["Netflix"]);

    const named = namedCharge(finding(["$15.99"]), digest, recurring, "USD");
    expect(named?.note).toBe("Netflix");
    expect(named?.cadence).toBe("monthly");
  });

  it("accepts an amount quoted without its currency mark", () => {
    // The generating function pools a display string and its bare form
    // together, so "15.99" is a legitimate stored quote of "$15.99".
    const { digest, recurring } = setup(monthly());
    expect(namedCharge(finding(["15.99"]), digest, recurring, "USD")?.note).toBe(
      "Netflix",
    );
  });

  it("names nothing when the amount is not a repeating charge", () => {
    // One big grocery shop that happens to cost what the subscription costs.
    // The digest never called it a repeat, so it is not grounds for a name.
    const rows = [
      ...monthly(),
      tx({ category: "groceries", amount_usd_cents: 8800, note: "Big shop" }),
    ];
    const { digest, recurring } = setup(rows);
    expect(namedCharge(finding(["$88.00"]), digest, recurring, "USD")).toBeNull();
  });

  it("names nothing when two payments share the amount and category", () => {
    // Two subscriptions at the same price in the same category are
    // indistinguishable from here. Picking one would be a coin toss.
    const { digest, recurring } = setup([
      ...monthly(),
      ...monthly({ note: "Spotify" }),
    ]);
    expect(recurring.payments).toHaveLength(2);
    expect(namedCharge(finding(["$15.99"]), digest, recurring, "USD")).toBeNull();
  });

  it("never answers with money coming in", () => {
    const { digest, recurring } = setup(
      monthly({ is_income: true, category: "work", note: "Salary" }),
    );
    // Income is not spending, so it is not in the digest's repeats at all —
    // and even reaching the payments, a salary is not an errand.
    expect(namedCharge(finding(["$15.99"]), digest, recurring, "USD")).toBeNull();
  });

  it("names nothing when the payment has no note to name it by", () => {
    const { digest, recurring } = setup(monthly({ note: null }));
    expect(recurring.payments[0]?.note).toBeNull();
    expect(namedCharge(finding(["$15.99"]), digest, recurring, "USD")).toBeNull();
  });

  it("refuses when the finding is filed against another category", () => {
    const { digest, recurring } = setup(monthly());
    const filed = finding(["$15.99"], { category: "Groceries" });
    expect(namedCharge(filed, digest, recurring, "USD")).toBeNull();
  });

  it("agrees when the finding is filed against the payment's own category", () => {
    const { digest, recurring } = setup(monthly());
    const filed = finding(["$15.99"], { category: "Fees" });
    expect(namedCharge(filed, digest, recurring, "USD")?.note).toBe("Netflix");
  });

  it("names nothing with no evidence to go on", () => {
    const { digest, recurring } = setup(monthly());
    expect(namedCharge(finding([]), digest, recurring, "USD")).toBeNull();
  });

  it("names nothing while the device is locked", () => {
    // Every amount in a masked summary is zero, so every payment would match
    // an amount of zero and the first would win. See lib/recurring.
    const { digest, recurring } = setup(monthly());
    const masked: RecurringSummary = { ...recurring, anyMasked: true };
    expect(namedCharge(finding(["$15.99"]), digest, masked, "USD")).toBeNull();
  });

  it("names nothing without a recurring summary at all", () => {
    const { digest } = setup(monthly());
    expect(namedCharge(finding(["$15.99"]), digest, null, "USD")).toBeNull();
  });
});
