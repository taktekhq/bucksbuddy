import { describe, it, expect } from "vitest";
import { transactionsToCsv } from "./csv.js";
import type { Transaction } from "./types.js";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1250,
    original_currency: "USD",
    original_amount: 12.5,
    rate_used: 89500,
    occurred_at: "2026-06-01T10:00:00.000Z",
    note: null,
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("transactionsToCsv", () => {
  it("emits a header even with no rows", () => {
    const csv = transactionsToCsv([]);
    expect(csv.split("\n")).toHaveLength(1);
    expect(csv).toContain("date,type,category,subcategory");
  });

  it("renders income/expense, amounts and an empty note", () => {
    const csv = transactionsToCsv([
      tx({ is_income: true, amount_usd_cents: 5000, category: "salary" }),
    ]);
    const [, row] = csv.split("\n");
    expect(row).toContain("In");
    expect(row).toContain("Salary");
    expect(row).toContain("50.00");
    expect(row.endsWith(",")).toBe(true); // empty note as trailing field
  });

  it("includes the subcategory and Out type", () => {
    const csv = transactionsToCsv([tx({ category: "health/pharmacy" })]);
    const [, row] = csv.split("\n");
    expect(row).toContain("Out");
    expect(row).toContain("Health");
    expect(row).toContain("Pharmacy");
  });

  it("escapes notes containing commas, quotes and newlines", () => {
    const csv = transactionsToCsv([tx({ note: 'a, "b"\nc' })]);
    const row = csv.split("\n").slice(1).join("\n");
    expect(row).toContain('"a, ""b""');
  });

  it("preserves LBP currency in the export", () => {
    const csv = transactionsToCsv([
      tx({ original_currency: "LBP", original_amount: 1000000 }),
    ]);
    expect(csv).toContain("LBP");
  });
});

describe("csv format contract", () => {
  // The export is consumed by outside accounting tools, so the header row and
  // the quoting rule are an external contract, not an implementation detail.
  it("emits the exact header row", () => {
    expect(transactionsToCsv([]).split("\n")[0]).toBe(
      "date,type,category,subcategory,original_amount,original_currency," +
        "rate_used_lbp_per_usd,amount_usd,note",
    );
  });

  it("quotes only values containing a comma, quote or newline", () => {
    const plain = transactionsToCsv([tx({ note: "lunch" })]).split("\n")[1];
    expect(plain).toContain(",lunch");
    expect(plain).not.toContain('"lunch"');

    const risky = transactionsToCsv([tx({ note: 'a,b "c"' })]).split("\n")[1];
    expect(risky).toContain('"a,b ""c"""');
  });

  it("leaves the subcategory field empty when there is no subcategory", () => {
    const row = transactionsToCsv([tx({ category: "groceries" })]).split("\n")[1];
    expect(row.split(",")[3]).toBe("");
  });
});
