import type { Transaction } from "@/types/db";
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

export function transactionsToCsv(rows: Transaction[]): string {
  const header = [
    "date",
    "type",
    "category",
    "subcategory",
    "original_amount",
    "original_currency",
    "rate_used_lbp_per_usd",
    "amount_usd",
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
