import { describe, it, expect } from "vitest";
import {
  FONT_FAMILY,
  FONT_WEIGHT,
  fitSingleLine,
  fitText,
  textWidth,
  wrapLines,
} from "@/lib/recapText";

// Expected numbers below are read straight off the glyph tables in
// recapText.ts (1/1000 em): grobold "A" = 850, "B" = 689, "C" = 748,
// space = 300, "—" = 943; nunito700 digits = 600, space = 271, "…" = 745,
// '"' = 448; nunito900 "—" = 1000. Anything the tables don't know is
// budgeted at UNKNOWN = 700. The wrap/fit cases use nunito700 digits so
// every line is a round multiple of 0.6 em plus 0.271 em per space.

describe("textWidth", () => {
  it("scales an ASCII glyph's advance width by the size", () => {
    expect(textWidth("A", "grobold", 100)).toBe(85);
    expect(textWidth("AB", "grobold", 100)).toBeCloseTo(153.9);
    expect(textWidth("1111", "nunito700", 10)).toBeCloseTo(24);
  });

  it("knows the extra (non-ASCII) glyphs a card can show, per font", () => {
    expect(textWidth("€", "nunito700", 1000)).toBe(600);
    expect(textWidth("—", "grobold", 1000)).toBe(943);
    expect(textWidth("—", "nunito900", 1000)).toBe(1000);
  });

  it("budgets an unknown glyph generously so a measured fit is a real fit", () => {
    // A currency sign outside Latin-1, and an emoji (a surrogate pair that
    // must count as one glyph, not two).
    expect(textWidth("₺", "nunito700", 1000)).toBe(700);
    expect(textWidth("🙂", "grobold", 1000)).toBe(700);
    expect(textWidth("🙂🙂", "grobold", 1000, 10)).toBe(1410);
  });

  it("treats a zero-width table entry (a glyph the font lacks) as unknown", () => {
    // grobold has no '"'; nunito does.
    expect(textWidth('"', "grobold", 1000)).toBe(700);
    expect(textWidth('"', "nunito700", 1000)).toBe(448);
  });

  it("adds letter-spacing to the n-1 gaps between glyphs, never after the last", () => {
    expect(textWidth("ABC", "grobold", 100, 5)).toBeCloseTo(228.7 + 10);
    expect(textWidth("A", "grobold", 100, 5)).toBe(85);
  });

  it("is 0 for an empty string, even with letter-spacing", () => {
    expect(textWidth("", "nunito900", 40)).toBe(0);
    expect(textWidth("", "nunito900", 40, 3)).toBe(0);
  });
});

describe("FONT_FAMILY / FONT_WEIGHT", () => {
  it("map every font id to a CSS stack and the weight it renders at", () => {
    expect(FONT_FAMILY.grobold).toMatch(/^Grobold,/);
    expect(FONT_FAMILY.nunito700).toMatch(/^Nunito,/);
    expect(FONT_FAMILY.nunito900).toBe(FONT_FAMILY.nunito700);
    expect(FONT_WEIGHT).toEqual({ grobold: 400, nunito700: 700, nunito900: 900 });
  });
});

describe("wrapLines", () => {
  // At 10px: a digit is 6px, a space 2.71px. "11 22" = 26.71, "11 22 33" = 41.42.
  it("keeps text on one line when it fits", () => {
    expect(wrapLines("11 22 33", "nunito700", 10, 100)).toEqual(["11 22 33"]);
  });

  it("breaks at spaces, packing each line as full as it can", () => {
    expect(wrapLines("11 22 33", "nunito700", 10, 30)).toEqual(["11 22", "33"]);
    expect(wrapLines("11 22 33", "nunito700", 10, 20)).toEqual(["11", "22", "33"]);
  });

  it("gives a single over-long word its own line rather than cutting it", () => {
    // "111111" is 36px, wider than the box, wherever it falls.
    expect(wrapLines("111111", "nunito700", 10, 30)).toEqual(["111111"]);
    expect(wrapLines("1 111111 2", "nunito700", 10, 30)).toEqual(["1", "111111", "2"]);
  });

  it("always breaks at an explicit newline and drops blank paragraphs", () => {
    expect(wrapLines("11\n22", "nunito700", 10, 100)).toEqual(["11", "22"]);
    expect(wrapLines("11\n\n22", "nunito700", 10, 100)).toEqual(["11", "22"]);
  });

  it("collapses repeated, leading and trailing spaces", () => {
    expect(wrapLines("  11   22  ", "nunito700", 10, 100)).toEqual(["11 22"]);
  });

  it("returns no lines for empty or all-space text", () => {
    expect(wrapLines("", "nunito700", 10, 100)).toEqual([]);
    expect(wrapLines("   ", "nunito700", 10, 100)).toEqual([]);
  });

  it("measures candidates with the letter-spacing it was given", () => {
    // "11 22" is 26.71 at 10px; 4 gaps of 1px push it past a 30px box.
    expect(wrapLines("11 22", "nunito700", 10, 30)).toEqual(["11 22"]);
    expect(wrapLines("11 22", "nunito700", 10, 30, 1)).toEqual(["11", "22"]);
  });
});

describe("fitText", () => {
  it("returns maxSize untouched when the text already fits", () => {
    expect(
      fitText("1111", "nunito700", { maxWidth: 24, maxLines: 1, maxSize: 10, minSize: 4 }),
    ).toEqual({ size: 10, lines: ["1111"] });
  });

  it("shrinks in steps until a single word fits the width", () => {
    // 24px at 10, 19.2px at 8.
    expect(
      fitText("1111", "nunito700", { maxWidth: 20, maxLines: 1, maxSize: 10, minSize: 4 }),
    ).toEqual({ size: 8, lines: ["1111"] });
  });

  it("shrinks until the wrap needs no more than maxLines", () => {
    // "11 22" is 26.71 at 10, 21.37 at 8, 16.03 at 6 — only at 6 does the
    // text wrap onto two lines instead of three.
    expect(
      fitText("11 22 33", "nunito700", { maxWidth: 20, maxLines: 2, maxSize: 10, minSize: 4 }),
    ).toEqual({ size: 6, lines: ["11 22", "33"] });
  });

  it("falls back to minSize, drops extra lines and ellipsises the last one", () => {
    // At 6px: ["11 22", "33 44"]; "11 22…" = 20.5 overflows 20, so one
    // character is trimmed: "11 2…" = 16.9.
    expect(
      fitText("11 22 33 44", "nunito700", { maxWidth: 20, maxLines: 1, maxSize: 10, minSize: 6 }),
    ).toEqual({ size: 6, lines: ["11 2…"] });
  });

  it("appends the ellipsis without trimming when the kept line has room for it", () => {
    // "11 22…" = 20.5 fits 22, but "11 22 33" never wraps to one line.
    expect(
      fitText("11 22 33", "nunito700", { maxWidth: 22, maxLines: 1, maxSize: 8, minSize: 6 }),
    ).toEqual({ size: 6, lines: ["11 22…"] });
  });

  it("never trims the last line below one character", () => {
    // Nothing fits a 5px box, but "1…" is still returned rather than "…".
    expect(
      fitText("11 22", "nunito700", { maxWidth: 5, maxLines: 1, maxSize: 6, minSize: 6 }),
    ).toEqual({ size: 6, lines: ["1…"] });
  });

  it("leaves an over-long word alone when it's within maxLines at minSize", () => {
    // "111111" is 21.6px at 6 — too wide, but only one line of two, so it
    // overflows the box rather than being cut off.
    expect(
      fitText("111111", "nunito700", { maxWidth: 20, maxLines: 2, maxSize: 10, minSize: 6 }),
    ).toEqual({ size: 6, lines: ["111111"] });
  });

  it("honours a custom step", () => {
    // 21.6px at 9 fits 22; the default 2px step would skip from 10 to 8.
    const opts = { maxWidth: 22, maxLines: 1, maxSize: 10, minSize: 4 };
    expect(fitText("1111", "nunito700", opts)).toEqual({ size: 8, lines: ["1111"] });
    expect(fitText("1111", "nunito700", { ...opts, step: 1 })).toEqual({
      size: 9,
      lines: ["1111"],
    });
  });

  it("includes letter-spacing in every measurement", () => {
    // 24px at 10 fits 26 — until 3 gaps of 2px push it to 30.
    const opts = { maxWidth: 26, maxLines: 1, maxSize: 10, minSize: 4 };
    expect(fitText("1111", "nunito700", opts).size).toBe(10);
    expect(fitText("1111", "nunito700", { ...opts, letterSpacing: 2 }).size).toBe(8);
    // ...and in the ellipsis fallback: "11 22…" is 20.5 at 6 and just fits a
    // 20.5px box unspaced, but with 1px gaps two characters have to go.
    const fallback = { maxWidth: 20.5, maxLines: 1, maxSize: 6, minSize: 6 };
    expect(fitText("11 22 33 44", "nunito700", fallback).lines).toEqual(["11 22…"]);
    expect(
      fitText("11 22 33 44", "nunito700", { ...fallback, letterSpacing: 1 }),
    ).toEqual({ size: 6, lines: ["11 …"] });
  });
});

describe("fitSingleLine", () => {
  it("caps at maxSize when the text fits, including exactly", () => {
    expect(fitSingleLine("1111", "nunito700", 100, 10)).toBe(10);
    expect(fitSingleLine("1111", "nunito700", 24, 10)).toBe(10);
  });

  it("scales down in proportion when the text is wider, with no floor", () => {
    // 24px natural width into 12px: exactly half the size.
    expect(fitSingleLine("1111", "nunito700", 12, 10)).toBe(5);
  });

  it("rounds the scaled size down so it never overflows", () => {
    // 10 * 10 / 24 = 4.17 → 4.
    expect(fitSingleLine("1111", "nunito700", 10, 10)).toBe(4);
  });
});

describe("fitSingleLine with letter-spacing", () => {
  it("takes the fixed gaps off the budget before scaling the glyphs", () => {
    // Four digits at 10px are 24px wide; three 2px gaps make 30. A 30px box
    // still fits at full size…
    expect(fitSingleLine("1111", "nunito700", 30, 10, 2)).toBe(10);
    // …but a 21px box leaves 15px for the glyphs: 10 * 15 / 24 = 6.25 → 6.
    expect(fitSingleLine("1111", "nunito700", 21, 10, 2)).toBe(6);
  });

  it("never drops below 1px even when the gaps alone overflow the box", () => {
    expect(fitSingleLine("1111", "nunito700", 4, 10, 2)).toBe(1);
  });
});
