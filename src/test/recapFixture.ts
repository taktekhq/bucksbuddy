import type { Transaction } from "@/types/db";
export function recapRow(
  id: string,
  category = "food",
  cents = 100,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    user_id: "private-user",
    is_income: false,
    category,
    amount_usd_cents: cents,
    original_currency: "EUR",
    original_amount: 999999,
    rate_used: 3,
    occurred_at: new Date(2025, 11, 15, 12).toISOString(),
    created_at: "2025-12-15",
    note: "private-note",
    ...overrides,
  };
}
// Issue #116's numeric fixture: Groceries outranks Parking under its ranking
// contract, so the monthly split is Food 38 / Groceries 25 / remainder 37.
export const recapFixture = [
  ...Array.from({ length: 22 }, (_, i) =>
    recapRow(
      `food-${i}`,
      i % 2 ? "food/delivery" : "food/restaurant",
      i === 21 ? 1800 : 1000,
    ),
  ),
  recapRow("parking", "parking", 11400),
  recapRow("groceries", "groceries", 15000),
  recapRow("fun", "fun", 10800),
];
