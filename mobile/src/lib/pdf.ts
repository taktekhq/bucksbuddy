// A tiny PDF writer — enough for the one thing we need, a printable statement
// of transactions, with no dependency and no native module. The web hands the
// bytes to a Blob; the Expo app writes them to a file. Same code both sides.
//
// We use the two PDF "standard 14" fonts (Helvetica and Helvetica-Bold), which
// every reader has built in, so nothing has to be embedded. That buys us
// WinAnsi coverage — Latin-1 plus the usual typographic punctuation, which is
// every category label we ship (including "Café"). A note written outside that
// (Arabic, emoji) degrades to "?" here; the CSV export stays lossless.

import type { Transaction } from "@/types/db";
import {
  categoryLabel,
  categorySubLabel,
  splitCategory,
} from "@/lib/categories";
import { formatSignedUsdCents, formatUsdCents, netCents } from "@/lib/money";

// --- Text metrics -----------------------------------------------------------

// Helvetica advance widths (1/1000 em) for ASCII 32–126, straight from the
// standard AFM. We need real widths to right-align the money columns and to
// truncate a long note at the exact pixel the cell ends.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Width of `text` at `size` points, in points. */
export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  // By code point, not code unit — toWinAnsi folds by code point, so an emoji
  // becomes ONE "?" and must be measured as one character. Counting its two
  // surrogates would over-measure and truncate a note that actually fits.
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // Outside ASCII we're in the accented range, which is 556 across the board
    // in Helvetica — close enough that nothing visibly misaligns.
    units += code >= 32 && code <= 126 ? table[code - 32] : 556;
  }
  return (units * size) / 1000;
}

/** Cut `text` down to `max` points, with an ellipsis when something was lost. */
export function truncateToWidth(
  text: string,
  max: number,
  size: number,
  bold = false,
): string {
  if (textWidth(text, size, bold) <= max) return text;
  const ellipsis = "...";
  const room = max - textWidth(ellipsis, size, bold);
  if (room <= 0) return "";
  let out = "";
  for (const ch of text) {
    if (textWidth(out + ch, size, bold) > room) break;
    out += ch;
  }
  return out + ellipsis;
}

// --- Encoding ---------------------------------------------------------------

// The corner of WinAnsi that isn't Latin-1: 0x80–0x9F holds typographic
// punctuation. Anything a note might realistically pick up from a phone
// keyboard (curly quotes, an en dash, an ellipsis) lands here.
const WIN_ANSI_HIGH: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84,
  "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
  "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** Fold a string onto WinAnsi, replacing anything the font can't draw. */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) out += ch;
    // 0x80-0xFF is WinAnsi's own range, so a string that has already been
    // folded once passes through untouched — this stays idempotent.
    else if (code >= 0x80 && code <= 0xff) out += ch;
    else if (WIN_ANSI_HIGH[ch] !== undefined) {
      out += String.fromCharCode(WIN_ANSI_HIGH[ch]);
    // Tabs and line breaks are real characters, not unsupported ones — a note
    // written across two lines should read as one cell, not as "?".
    } else if (code === 9 || code === 10 || code === 13) out += " ";
    else out += "?";
  }
  return out;
}

/** A PDF literal string: WinAnsi bytes with the three reserved chars escaped. */
function pdfString(text: string): string {
  return `(${toWinAnsi(text).replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

// --- Layout -----------------------------------------------------------------

// A4, in points, the way every PDF measures.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const BODY = 9;
const ROW_H = 15;
const BOTTOM = 56; // where rows stop and the footer begins

// The app's palette, as PDF fill colors (0-1 per channel).
const CARROT = "0.961 0.388 0";
const LABEL = "0.110 0.110 0.118";
const MUTED = "0.557 0.557 0.576";
const INCOME = "0.204 0.780 0.349";
const EXPENSE = "1 0.231 0.188";
const HAIRLINE = "0.898 0.898 0.918";
const ZEBRA = "0.973 0.973 0.976";

type Column = {
  key: "date" | "type" | "category" | "original" | "usd" | "note";
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
  { key: "usd", head: "USD", w: 74, right: true },
  // Whatever is left goes to the note — it's the free text, the column most
  // worth reading, and the only one that runs long.
  { key: "note", head: "Note", w: CONTENT_W - 62 - 28 - 120 - 96 - 74 },
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "01 Jun 2026" - local calendar day, same as the rest of the app reads it. */
function pdfDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

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

// --- Content-stream primitives ----------------------------------------------

// A page is a list of drawing operators; we build them all before writing any
// object, because the footer needs the final page count.
type Ops = string[];

function text(
  ops: Ops,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  bold = false,
) {
  ops.push(
    `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfString(s)} Tj ET`,
  );
}

/** Same as `text`, but the string ends at `right` instead of starting at `x`. */
function textRight(
  ops: Ops,
  s: string,
  right: number,
  y: number,
  size: number,
  color: string,
  bold = false,
) {
  text(ops, s, right - textWidth(s, size, bold), y, size, color, bold);
}

function rect(ops: Ops, x: number, y: number, w: number, h: number, color: string) {
  ops.push(
    `${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
  );
}

function line(ops: Ops, x1: number, y: number, x2: number, color: string, w = 0.5) {
  ops.push(
    `${color} RG ${w} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`,
  );
}

// --- Document ---------------------------------------------------------------

export type PdfMeta = {
  /** Big line at the top — the app name. */
  title: string;
  /** What was exported, e.g. "Last month · August 2026". */
  rangeLabel: string;
};

/** Draws the column headings and returns the baseline for the first row. */
function tableHead(ops: Ops, y: number): number {
  let x = MARGIN;
  for (const col of COLUMNS) {
    if (col.right) textRight(ops, col.head, x + col.w - 6, y, 8, MUTED, true);
    else text(ops, col.head, x, y, 8, MUTED, true);
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
  const totals: [string, string, string][] = [
    ["In", formatUsdCents(inCents), INCOME],
    ["Out", formatUsdCents(outCents), EXPENSE],
    ["Net", formatSignedUsdCents(netCents(rows)), LABEL],
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
function drawRow(ops: Ops, r: Transaction, y: number, zebra: boolean) {
  if (zebra) rect(ops, MARGIN, y - 4.5, CONTENT_W, ROW_H, ZEBRA);

  const signed = r.is_income ? r.amount_usd_cents : -r.amount_usd_cents;
  const cells: Record<Column["key"], [string, string]> = {
    date: [pdfDate(r.occurred_at), LABEL],
    type: [r.is_income ? "In" : "Out", r.is_income ? INCOME : EXPENSE],
    category: [categoryCell(r.category), LABEL],
    original: [originalAmount(r), MUTED],
    usd: [formatSignedUsdCents(signed), r.is_income ? INCOME : EXPENSE],
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
  y = tableHead(ops, y);

  rows.forEach((r, i) => {
    if (y < BOTTOM) {
      pages.push(ops);
      ops = [];
      y = tableHead(ops, PAGE_H - MARGIN - 10);
    }
    drawRow(ops, r, y, i % 2 === 1);
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

  return serialize(pages, meta, now);
}

// --- Serialization ----------------------------------------------------------

// Every byte we emit is WinAnsi, so one character is one byte and a string's
// `.length` is its byte length. That's what lets the cross-reference table —
// which is a list of exact byte offsets, and is the one part of a PDF a reader
// will not forgive — be computed by simply accumulating lengths.

/** PDF's own date syntax: D:YYYYMMDDHHmmSSZ, in UTC. */
function pdfTimestamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `D:${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`
  );
}

function serialize(pages: Ops[], meta: PdfMeta, now: Date): Uint8Array<ArrayBuffer> {
  // Objects 1-5 are fixed; each page then takes two (the page and its content
  // stream), so page i lives at 6 + i * 2.
  const pageId = (i: number) => 6 + i * 2;
  const kids = pages.map((_, i) => `${pageId(i)} 0 R`).join(" ");

  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    `<< /Title ${pdfString(meta.title)} /Producer (BucksBuddy) /CreationDate (${pdfTimestamp(now)}) >>`,
  ];

  pages.forEach((ops, i) => {
    const stream = ops.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });

  // The leading binary comment tells anything treating the file as text that
  // it is not text. Conventional, and some readers look for it.
  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const startXref = body.length;
  // Entries are fixed-width — exactly 20 bytes each, free entry first.
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  const pdf =
    body +
    xref +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\n` +
    `startxref\n${startXref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
