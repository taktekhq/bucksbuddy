import { describe, it, expect } from "vitest";
import {
  textWidth,
  toWinAnsi,
  transactionsToPdf,
  truncateToWidth,
} from "@/lib/pdf";
import type { Transaction } from "@/types/db";

const NOW = new Date(2026, 8, 8, 12, 0, 0);

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1250,
    original_currency: "USD",
    original_amount: 12.5,
    rate_used: 89500,
    occurred_at: new Date(2026, 5, 1, 10, 0, 0).toISOString(),
    note: null,
    created_at: new Date(2026, 5, 1, 10, 0, 0).toISOString(),
    ...overrides,
  };
}

/** The bytes back as a string — one byte is one character, by construction. */
const asText = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join("");

const meta = { title: "BucksBuddy", rangeLabel: "Last month · August 2026" };

describe("textWidth", () => {
  it("measures ASCII from the Helvetica tables", () => {
    // "i" (222) is much narrower than "W" (944) at the same size.
    expect(textWidth("i", 10)).toBeCloseTo(2.22, 5);
    expect(textWidth("W", 10)).toBeCloseTo(9.44, 5);
  });

  it("scales linearly with size", () => {
    expect(textWidth("Hello", 20)).toBeCloseTo(textWidth("Hello", 10) * 2, 5);
  });

  it("measures bold wider than regular for the same word", () => {
    expect(textWidth("Category", 9, true)).toBeGreaterThan(
      textWidth("Category", 9, false),
    );
  });

  it("falls back to a nominal width outside ASCII", () => {
    expect(textWidth("é", 10)).toBeCloseTo(5.56, 5);
  });

  it("is zero for an empty string", () => {
    expect(textWidth("", 10)).toBe(0);
  });

  it("measures an astral character as the one glyph it becomes", () => {
    // toWinAnsi folds "🥕" to a single "?". Measuring its two surrogates would
    // double-count and truncate notes that actually fit.
    expect(textWidth("🥕", 10)).toBeCloseTo(textWidth("?", 10), 5);
    expect(textWidth("🥕", 10)).toBeCloseTo(textWidth(toWinAnsi("🥕"), 10), 5);
  });
});

describe("truncateToWidth", () => {
  it("leaves text that already fits", () => {
    expect(truncateToWidth("short", 100, 9)).toBe("short");
  });

  it("cuts and marks what it dropped", () => {
    const out = truncateToWidth("a very long note indeed", 40, 9);
    expect(out.endsWith("...")).toBe(true);
    expect(textWidth(out, 9)).toBeLessThanOrEqual(40);
  });

  it("does not over-truncate a note of astral characters", () => {
    const carrots = "🥕".repeat(20);
    // All twenty fold to twenty "?" and fit, so nothing should be cut.
    expect(textWidth(toWinAnsi(carrots), 9)).toBeLessThan(129);
    expect(truncateToWidth(carrots, 129, 9)).toBe(carrots);
  });

  it("gives up when there is no room even for the ellipsis", () => {
    expect(truncateToWidth("anything", 2, 9)).toBe("");
  });

  it("measures with the bold table when asked", () => {
    const out = truncateToWidth("a very long heading here", 40, 9, true);
    expect(textWidth(out, 9, true)).toBeLessThanOrEqual(40);
  });
});

describe("toWinAnsi", () => {
  it("passes ASCII through", () => {
    expect(toWinAnsi("Groceries 12.50")).toBe("Groceries 12.50");
  });

  it("keeps Latin-1 accents, which the category labels need", () => {
    expect(toWinAnsi("Café")).toBe("Café");
  });

  it("maps typographic punctuation into the WinAnsi high range", () => {
    expect([...toWinAnsi("’“”–—…•€")].map((c) => c.charCodeAt(0))).toEqual([
      0x92, 0x93, 0x94, 0x96, 0x97, 0x85, 0x95, 0x80,
    ]);
  });

  it("turns tabs and line breaks into spaces, not unsupported marks", () => {
    expect(toWinAnsi("a\tb")).toBe("a b");
    expect(toWinAnsi("line one\nline two")).toBe("line one line two");
    expect(toWinAnsi("cr\r\nlf")).toBe("cr  lf");
  });

  it("replaces anything the font cannot draw", () => {
    expect(toWinAnsi("a🥕b")).toBe("a?b");
    expect(toWinAnsi("مرحبا")).toBe("?????");
  });

  it("is idempotent, so folding twice cannot corrupt", () => {
    const once = toWinAnsi("it’s a café — 🥕");
    expect(toWinAnsi(once)).toBe(once);
  });
});

describe("transactionsToPdf", () => {
  it("writes a structurally valid PDF", () => {
    const text = asText(transactionsToPdf([tx()], meta, NOW));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Encoding /WinAnsiEncoding");
  });

  it("points every cross-reference entry at its object", () => {
    const bytes = transactionsToPdf([tx(), tx()], meta, NOW);
    const text = asText(bytes);
    const start = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
    expect(text.slice(start, start + 4)).toBe("xref");

    const header = /xref\n0 (\d+)\n/.exec(text.slice(start))!;
    const count = Number(header[1]);
    // Entry 0 is the free-list head, so object i sits at slot i.
    const table = text.slice(start + header[0].length);
    for (let i = 1; i < count; i++) {
      const entry = table.slice(i * 20, (i + 1) * 20);
      expect(entry).toHaveLength(20);
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    }
  });

  it("declares every content stream's exact byte length", () => {
    // Several pages, so this covers continuation streams too.
    const rows = Array.from({ length: 120 }, (_, i) => tx({ id: String(i) }));
    const text = asText(transactionsToPdf(rows, meta, NOW));
    const matches = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
    expect(matches.length).toBeGreaterThan(1);
    for (const match of matches) {
      const declared = Number(match[1]);
      expect(text.slice(match.index + match[0].length + declared)).toMatch(
        /^\nendstream/,
      );
    }
  });

  it("draws the title, the range and the generation date on the page", () => {
    const text = asText(
      transactionsToPdf([tx()], { title: "Ledger", rangeLabel: "Last month" }, NOW),
    );
    // Must be DRAWN, not merely present in the Info dictionary — assert on a
    // text-showing operator, which only the masthead emits.
    expect(text).toMatch(/Tf [\d. ]+rg 1 0 0 1 [\d.]+ [\d.]+ Tm \(Ledger\) Tj/);
    expect(text).toMatch(/Tm \(Last month\) Tj/);
    expect(text).toMatch(/Tm \(Generated 08 Sep 2026 · 1 entry\) Tj/);
  });

  it("counts one entry in the singular", () => {
    expect(asText(transactionsToPdf([tx()], meta, NOW))).toContain("1 entry");
  });

  it("counts several in the plural", () => {
    expect(asText(transactionsToPdf([tx(), tx()], meta, NOW))).toContain(
      "2 entries",
    );
  });

  it("totals income, spending and the net", () => {
    // Two rows per side, so each total is a sum no single row cell equals —
    // otherwise the assertions could be satisfied by the rows themselves.
    const text = asText(
      transactionsToPdf(
        [
          tx({ is_income: true, amount_usd_cents: 5000 }),
          tx({ is_income: true, amount_usd_cents: 1100 }),
          tx({ amount_usd_cents: 2000 }),
          tx({ amount_usd_cents: 300 }),
        ],
        meta,
        NOW,
      ),
    );
    expect(text).toContain("Tm ($61.00) Tj"); // in:  50.00 + 11.00
    expect(text).toContain("Tm ($23.00) Tj"); // out: 20.00 +  3.00
    expect(text).toContain("Tm ($38.00) Tj"); // net: 61.00 - 23.00
    // None of those is a row cell, so the masthead is genuinely being read.
    expect(text).not.toContain("Tm (-$61.00) Tj");
  });

  it("shows a negative net with its sign", () => {
    // Two expenses, so the net (-$25.00) is not equal to either row's cell.
    const text = asText(
      transactionsToPdf(
        [tx({ amount_usd_cents: 2000 }), tx({ amount_usd_cents: 500 })],
        meta,
        NOW,
      ),
    );
    expect(text).toContain("Tm (-$25.00) Tj");
  });

  it("labels each row's direction", () => {
    // The masthead totals block also draws "In" and "Out", so count rather than
    // just look: one from the masthead, plus one per row of that direction.
    const count = (text: string, word: string) =>
      (text.match(new RegExp(`Tm \\(${word}\\) Tj`, "g")) || []).length;

    const income = asText(
      transactionsToPdf([tx({ is_income: true }), tx({ is_income: true })], meta, NOW),
    );
    expect(count(income, "In")).toBe(3);
    expect(count(income, "Out")).toBe(1);

    const mixed = asText(transactionsToPdf([tx({ is_income: true }), tx()], meta, NOW));
    expect(count(mixed, "In")).toBe(2);
    expect(count(mixed, "Out")).toBe(2);
  });

  it("joins a subcategory onto its parent", () => {
    const text = asText(
      transactionsToPdf([tx({ category: "health/pharmacy" })], meta, NOW),
    );
    expect(text).toContain("(Health · Pharmacy)");
  });

  it("prints a bare category when there is no subcategory", () => {
    expect(asText(transactionsToPdf([tx({ category: "gas" })], meta, NOW))).toContain(
      "(Gas)",
    );
  });

  it("keeps the as-entered amount and its currency", () => {
    const text = asText(
      transactionsToPdf(
        [tx({ original_currency: "LBP", original_amount: 1000000 })],
        meta,
        NOW,
      ),
    );
    expect(text).toContain("1,000,000 LBP");
  });

  it("never truncates a money column, however large the amount", () => {
    const text = asText(
      transactionsToPdf(
        [
          tx({
            amount_usd_cents: 123456789,
            original_currency: "LBP",
            original_amount: 100000000000,
          }),
        ],
        meta,
        NOW,
      ),
    );
    // In full, with the cents and the currency intact — an ellipsized number
    // would read as a smaller number, and a cut "LBP" loses the currency.
    expect(text).toContain("(100,000,000,000 LBP)");
    expect(text).toContain("(-$1,234,567.89)");
    expect(text).not.toContain("567...");
  });

  it("shrinks the type rather than cut an amount too wide for its column", () => {
    const text = asText(
      transactionsToPdf(
        [tx({ original_currency: "LBP", original_amount: 1e15 })],
        meta,
        NOW,
      ),
    );
    const cell = "1,000,000,000,000,000 LBP";
    expect(text).toContain(`(${cell})`);
    // Drawn at less than the body size, which is how it still fits.
    const size = new RegExp(`/F1 ([\\d.]+) Tf[^(]*\\(${cell.replace(/,/g, ",")}\\)`);
    expect(Number(size.exec(text)![1])).toBeLessThan(9);
  });

  it("escapes parentheses and backslashes in a note", () => {
    const text = asText(transactionsToPdf([tx({ note: "a (b) c \\ d" })], meta, NOW));
    expect(text).toContain("\\(b\\)");
    expect(text).toContain("\\\\");
  });

  it("renders an empty note as an empty cell", () => {
    expect(() => transactionsToPdf([tx({ note: null })], meta, NOW)).not.toThrow();
  });

  it("says so when the range is empty", () => {
    const text = asText(transactionsToPdf([], meta, NOW));
    expect(text).toContain("No transactions in this range.");
    expect(text).toContain("/Count 1");
  });

  it("breaks into pages and numbers them", () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      tx({ id: String(i), note: `row ${i}` }),
    );
    const text = asText(transactionsToPdf(rows, meta, NOW));
    const pages = Number(/\/Count (\d+)/.exec(text)![1]);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`(Page 1 of ${pages})`);
    expect(text).toContain(`(Page ${pages} of ${pages})`);
  });

  it("repeats the column headings on every page", () => {
    const rows = Array.from({ length: 120 }, (_, i) => tx({ id: String(i) }));
    const text = asText(transactionsToPdf(rows, meta, NOW));
    const pages = Number(/\/Count (\d+)/.exec(text)![1]);
    expect(text.split("(Category)").length - 1).toBe(pages);
  });

  it("stamps the creation date in PDF's own date syntax", () => {
    const text = asText(transactionsToPdf([tx()], meta, new Date(Date.UTC(2026, 8, 8, 9, 5, 3))));
    expect(text).toContain("(D:20260908090503Z)");
  });

  // The whole file format rests on one character being one byte: the xref
  // offsets are computed from string lengths. A single char above 0xFF would
  // desynchronise every offset and no reader would open the file.
  it("never lets a character above 0xFF reach the byte writer", () => {
    const bytes = transactionsToPdf(
      [tx({ note: "emoji 🥕 arabic مرحبا cjk 漢字 curly ’", category: "health/pharmacy" })],
      { title: "Bücks🥕Buddy", rangeLabel: "Past 3 months · 漢字" },
      NOW,
    );
    expect(bytes.every((b) => b <= 0xff)).toBe(true);
    expect(asText(bytes)).not.toContain("🥕");
  });

  it("keeps every row on the page, and never emits an empty one", () => {
    // Row counts either side of each page boundary.
    for (const count of [1, 39, 40, 41, 47, 48, 88, 89, 120]) {
      // A unique note per row — the summary block also prints "Out", so the
      // type cell can't be used to count rows.
      const rows = Array.from({ length: count }, (_, i) =>
        tx({ id: String(i), note: `row ${i}` }),
      );
      const text = asText(transactionsToPdf(rows, meta, NOW));
      const streams = text
        .split("\nstream\n")
        .slice(1)
        .map((s) => s.split("\nendstream")[0]);

      // Every row is drawn exactly once, and every page carries at least one.
      const perPage = streams.map((s) => (s.match(/\(row \d+\) Tj/g) || []).length);
      expect(perPage.every((n) => n > 0)).toBe(true);
      expect(perPage.reduce((a, b) => a + b, 0)).toBe(count);

      // ...and no row's baseline drops into the footer.
      const baselines = [
        ...text.matchAll(/1 0 0 1 [\d.]+ ([\d.-]+) Tm \(row \d+\)/g),
      ].map((m) => Number(m[1]));
      expect(Math.min(...baselines)).toBeGreaterThanOrEqual(56);
    }
  });

  it("defaults to the real current date", () => {
    expect(asText(transactionsToPdf([tx()], meta))).toContain("/CreationDate");
  });
});
