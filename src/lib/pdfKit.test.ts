import { describe, it, expect } from "vitest";
import { textWidth, toWinAnsi, truncateToWidth } from "@/lib/pdfKit";

// The PDF writer's own machinery, independent of what any document draws with
// it: how wide a string is in Helvetica, where to cut one that does not fit,
// and what happens to a character the standard fonts cannot draw.

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
