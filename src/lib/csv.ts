import type { Transaction } from "@/types/db";
import type { Currency } from "@/lib/currency";
import {
  categoryLabel,
  categorySubLabel,
  splitCategory,
} from "@/lib/categories";

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * The rows as CSV. `homeCurrency` names the normalized-amount column
 * ("amount_usd", "amount_eur"); `rate_used` is units of the original currency
 * per 1 of home at the time of entry (1 for entries typed in home).
 */
export function transactionsToCsv(rows: Transaction[], homeCurrency: Currency): string {
  const header = [
    "date",
    "type",
    "category",
    "subcategory",
    "original_amount",
    "original_currency",
    "rate_used",
    `amount_${homeCurrency.toLowerCase()}`,
    "note",
  ];

  const lines = rows.map((r) =>
    [
      r.occurred_at,
      r.is_income ? "In" : "Out",
      categoryLabel(splitCategory(r.category).base),
      categorySubLabel(r.category) ?? "",
      r.original_amount,
      r.original_currency,
      r.rate_used,
      (r.amount_usd_cents / 100).toFixed(2),
      r.note ?? "",
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}
