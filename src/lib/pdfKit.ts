// A tiny PDF writer: pages, text, rectangles and rules, and the bytes to wrap
// them in. No dependency and no native module — the web hands the output to a
// Blob, the Expo app writes it straight to a file.
//
// This is the machinery only. What gets DRAWN lives with each document:
// lib/pdf.ts prints a statement of transactions, lib/reviewPdf.ts prints a
// spending review. They were one file until the review needed the same
// primitives, and a "tiny PDF writer" turned out to be a genuinely separate
// concern from "a statement of transactions" — the page geometry, the font
// metrics and the cross-reference table have no opinion about either.
//
// We use the two PDF "standard 14" fonts (Helvetica and Helvetica-Bold), which
// every reader has built in, so nothing has to be embedded. That buys us
// WinAnsi coverage — Latin-1 plus the usual typographic punctuation, which is
// every category label we ship (including "Café"). Text outside that (Arabic,
// emoji) degrades to "?"; the CSV export stays lossless.

import { currencySymbol, type Currency } from "@/lib/currency";
import type { SymbolStyle } from "@/lib/money";

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
export function pdfString(text: string): string {
  return `(${toWinAnsi(text).replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

// --- Page geometry and palette ----------------------------------------------

// A4, in points, the way every PDF measures.
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 40;
export const CONTENT_W = PAGE_W - MARGIN * 2;

/** Where a page's content stops and the footer begins. */
export const BOTTOM = 56;

// The app's palette, as PDF fill colors (0-1 per channel).
export const CARROT = "0.961 0.388 0";
export const LABEL = "0.110 0.110 0.118";
export const MUTED = "0.557 0.557 0.576";
export const INCOME = "0.204 0.780 0.349";
export const EXPENSE = "1 0.231 0.188";
export const HAIRLINE = "0.898 0.898 0.918";
export const ZEBRA = "0.973 0.973 0.976";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "01 Jun 2026" - local calendar day, same as the rest of the app reads it. */
export function pdfDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// --- Content-stream primitives ----------------------------------------------

// A page is a list of drawing operators; we build them all before writing any
// object, because the footer needs the final page count.
export type Ops = string[];

export function text(
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
export function textRight(
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

export function rect(ops: Ops, x: number, y: number, w: number, h: number, color: string) {
  ops.push(
    `${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
  );
}

export function line(ops: Ops, x1: number, y: number, x2: number, color: string, w = 0.5) {
  ops.push(
    `${color} RG ${w} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`,
  );
}

// The standard fonts draw WinAnsi only, so a symbol outside it ("₺", "₹") would
// print as "?" — for those the code goes in front of the number instead. ("€"
// is fine: it folds to WinAnsi's 0x80, not to "?".)
export function symbolStyle(currency: Currency): SymbolStyle {
  return toWinAnsi(currencySymbol(currency)).includes("?") ? "code" : "symbol";
}

// --- Serialization ----------------------------------------------------------

// Every byte we emit is WinAnsi, so one character is one byte and a string's
// `.length` is its byte length. That's what lets the cross-reference table —
// which is a list of exact byte offsets, and is the one part of a PDF a reader
// will not forgive — be computed by simply accumulating lengths.

/** PDF's own date syntax: D:YYYYMMDDHHmmSSZ, in UTC. */
export function pdfTimestamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `D:${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`
  );
}

export function serialize(
  pages: Ops[],
  title: string,
  now: Date,
): Uint8Array<ArrayBuffer> {
  // Objects 1-5 are fixed; each page then takes two (the page and its content
  // stream), so page i lives at 6 + i * 2.
  const pageId = (i: number) => 6 + i * 2;
  const kids = pages.map((_, i) => `${pageId(i)} 0 R`).join(" ");

  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    `<< /Title ${pdfString(title)} /Producer (BucksBuddy) /CreationDate (${pdfTimestamp(now)}) >>`,
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
