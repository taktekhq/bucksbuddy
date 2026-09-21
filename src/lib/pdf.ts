// A printable statement of transactions: the table people actually asked for
// when they asked to export their entries.
//
// The PDF machinery it is drawn with — page geometry, font metrics, the
// content-stream operators and the cross-reference table — lives in
// lib/pdfKit.ts. This file is only the statement.

import type { Transaction } from "@/types/db";
import {
  categoryLabel,
  categorySubLabel,
  splitCategory,
} from "@/lib/categories";
import { type Currency } from "@/lib/currency";
import {
  formatCents,
  formatSignedCents,
  netCents,
} from "@/lib/money";
import {
  CARROT,
  CONTENT_W,
  HAIRLINE,
  EXPENSE,
  INCOME,
  LABEL,
  MARGIN,
  MUTED,
  PAGE_H,
  PAGE_W,
  BOTTOM,
  ZEBRA,
  line,
  pdfDate,
  rect,
  serialize,
  symbolStyle,
  text,
  textRight,
  textWidth,
  truncateToWidth,
  type Ops,
} from "@/lib/pdfKit";

const BODY = 9;
const ROW_H = 15;

type Column = {
  key: "date" | "type" | "category" | "original" | "home" | "note";
  head: string;
  w: number;
  right?: boolean;
};

// Widths add up to CONTENT_W exactly, so the table spans the text block.
const COLUMNS: Column[] = [
  { key: "date", head: "Date", w: 62 },
  { key: "type", head: "Type", w: 28 },
  { key: "category", head: "Category", w: 120 },
  // The money columns are sized for the worst amounts anyone can actually
  // enter — LBP runs to eleven or twelve digits, and "100,000,000,000 LBP" is
  // about 87pt of 9pt type.
  { key: "original", head: "Original", w: 96, right: true },
  // Headed with the home currency's code at draw time (see tableHead).
  { key: "home", head: "", w: 74, right: true },
  // Whatever is left goes to the note — it's the free text, the column most
  // worth reading, and the only one that runs long.
  { key: "note", head: "Note", w: CONTENT_W - 62 - 28 - 120 - 96 - 74 },
];


/** The as-entered amount with its currency: "1,000,000 LBP". */
function originalAmount(r: Transaction): string {
  return `${r.original_amount.toLocaleString("en-US")} ${r.original_currency}`;
}

/** "Health - Pharmacy", or just "Health" when there's no subcategory. */
function categoryCell(category: string): string {
  const label = categoryLabel(splitCategory(category).base);
  const sub = categorySubLabel(category);
  return sub ? `${label} · ${sub}` : label;
}

export type PdfMeta = {
  /** Big line at the top — the app name. */
  title: string;
  /** What was exported, e.g. "Last month · August 2026". */
  rangeLabel: string;
  /** The home currency the normalized amounts and totals are in. */
  currency: Currency;
};

/** Draws the column headings and returns the baseline for the first row. */
function tableHead(ops: Ops, y: number, currency: Currency): number {
  let x = MARGIN;
  for (const col of COLUMNS) {
    const head = col.key === "home" ? currency : col.head;
    if (col.right) textRight(ops, head, x + col.w - 6, y, 8, MUTED, true);
    else text(ops, head, x, y, 8, MUTED, true);
    x += col.w;
  }
  line(ops, MARGIN, y - 6, PAGE_W - MARGIN, HAIRLINE);
  return y - 6 - ROW_H;
}

/** The masthead on page one: title, what this covers, and the totals. */
function documentHead(ops: Ops, rows: Transaction[], meta: PdfMeta, now: Date): number {
  let y = PAGE_H - MARGIN - 18;
  text(ops, meta.title, MARGIN, y, 20, CARROT, true);

  y -= 20;
  text(ops, meta.rangeLabel, MARGIN, y, 11, LABEL);

  y -= 14;
  const count = `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`;
  text(ops, `Generated ${pdfDate(now.toISOString())} · ${count}`, MARGIN, y, 9, MUTED);

  // Totals, so the sheet answers "how much" without adding anything up.
  y -= 24;
  const inCents = rows.reduce((s, r) => s + (r.is_income ? r.amount_usd_cents : 0), 0);
  const outCents = rows.reduce((s, r) => s + (r.is_income ? 0 : r.amount_usd_cents), 0);
  const style = symbolStyle(meta.currency);
  const totals: [string, string, string][] = [
    ["In", formatCents(inCents, meta.currency, style), INCOME],
    ["Out", formatCents(outCents, meta.currency, style), EXPENSE],
    ["Net", formatSignedCents(netCents(rows), meta.currency, style), LABEL],
  ];
  let x = MARGIN;
  for (const [label, value, color] of totals) {
    text(ops, label, x, y, 8, MUTED, true);
    text(ops, value, x, y - 15, 14, color, true);
    x += 120;
  }

  y -= 30;
  line(ops, MARGIN, y, PAGE_W - MARGIN, CARROT, 1.5);
  return y - 24;
}

/** One transaction as six cells on the baseline `y`. */
function drawRow(
  ops: Ops,
  r: Transaction,
  y: number,
  zebra: boolean,
  currency: Currency,
) {
  if (zebra) rect(ops, MARGIN, y - 4.5, CONTENT_W, ROW_H, ZEBRA);

  const signed = r.is_income ? r.amount_usd_cents : -r.amount_usd_cents;
  const cells: Record<Column["key"], [string, string]> = {
    date: [pdfDate(r.occurred_at), LABEL],
    type: [r.is_income ? "In" : "Out", r.is_income ? INCOME : EXPENSE],
    category: [categoryCell(r.category), LABEL],
    original: [originalAmount(r), MUTED],
    home: [
      formatSignedCents(signed, currency, symbolStyle(currency)),
      r.is_income ? INCOME : EXPENSE,
    ],
    note: [r.note ?? "", MUTED],
  };

  let x = MARGIN;
  for (const col of COLUMNS) {
    const [raw, color] = cells[col.key];
    const max = col.w - 6;
    if (col.right) {
      // Money is never ellipsized — "$1,234,567..." reads as a number, not as
      // a truncation, and a cut "LBP" loses the currency entirely. Scale the
      // type down to fit instead. Width is linear in size, so this is exact;
      // the columns above are wide enough that it rarely engages.
      const size = Math.min(BODY, (BODY * max) / textWidth(raw, BODY));
      textRight(ops, raw, x + col.w - 6, y, size, color);
    } else {
      text(ops, truncateToWidth(raw, max, BODY), x, y, BODY, color);
    }
    x += col.w;
  }
}

/**
 * A printable statement of `rows`, as PDF bytes. The web wraps these in a Blob;
 * the Expo app writes them straight to a file.
 */
export function transactionsToPdf(
  rows: Transaction[],
  meta: PdfMeta,
  now = new Date(),
): Uint8Array<ArrayBuffer> {
  const pages: Ops[] = [];
  let ops: Ops = [];
  let y = documentHead(ops, rows, meta, now);
  y = tableHead(ops, y, meta.currency);

  rows.forEach((r, i) => {
    if (y < BOTTOM) {
      pages.push(ops);
      ops = [];
      y = tableHead(ops, PAGE_H - MARGIN - 10, meta.currency);
    }
    drawRow(ops, r, y, i % 2 === 1, meta.currency);
    y -= ROW_H;
  });

  if (rows.length === 0) {
    text(ops, "No transactions in this range.", MARGIN, y, 10, MUTED);
  }
  pages.push(ops);

  // Footers last: "Page 1 of 3" needs the count, which we only have now.
  pages.forEach((page, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    const x = (PAGE_W - textWidth(label, 8)) / 2;
    text(page, label, x, MARGIN - 12, 8, MUTED);
  });

  return serialize(pages, meta.title, now);
}
