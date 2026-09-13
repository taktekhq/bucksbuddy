// Text measurement for the Recap card, done with static glyph tables instead
// of the browser. The card is an SVG that is both the on-screen preview and
// the exported PNG, and SVG <text> does not wrap on its own — so every line
// break and every "does this amount fit?" decision is made here, from the
// fonts' real advance widths. That keeps layout identical in the preview, the
// export and the test suite, and independent of whether a font has finished
// loading yet (same idea as the Helvetica table in lib/pdf.ts).
//
// Widths are in 1/1000 em for ASCII 32–126 plus the few extra glyphs the
// card can show (currency signs, typographic punctuation). Regenerate the
// tables from public/fonts with opentype.js if a font file ever changes.

export type FontId = "grobold" | "nunito700" | "nunito900";

// grobold: missing ASCII "\"*<>[\\]^_`{|}~" (never used on a card)
const GROBOLD_ASCII = [
  300, 774, 0, 981, 641, 748, 845, 255, 404, 386, 0, 772, 237, 456, 219, 516,
  676, 518, 674, 638, 603, 571, 561, 539, 604, 568, 178, 209, 0, 693, 0, 725,
  782, 850, 689, 748, 720, 592, 546, 815, 721, 371, 581, 636, 560, 883, 762, 764,
  640, 774, 670, 591, 521, 644, 748, 985, 806, 701, 817, 0, 0, 0, 0, 0,
  0, 603, 640, 528, 664, 572, 416, 592, 587, 305, 392, 578, 299, 891, 591, 617,
  639, 637, 418, 446, 371, 591, 513, 788, 557, 502, 486, 0, 0, 0, 0,
];
const GROBOLD_EXTRA: Record<string, number> = { "“": 429, "”": 417, "—": 943, "é": 585 };

const NUNITO700_ASCII = [
  271, 248, 448, 600, 600, 945, 726, 243, 358, 358, 453, 600, 248, 434, 248, 313,
  600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 248, 248, 600, 600, 600, 459,
  950, 744, 688, 680, 762, 597, 562, 736, 773, 282, 354, 665, 562, 868, 748, 785,
  652, 785, 686, 631, 621, 738, 713, 1113, 672, 618, 605, 354, 313, 354, 600, 500,
  377, 547, 600, 472, 600, 542, 364, 604, 585, 255, 259, 536, 319, 877, 585, 576,
  600, 600, 392, 488, 384, 579, 527, 853, 546, 526, 474, 391, 288, 391, 600,
];
const NUNITO700_EXTRA: Record<string, number> = {
  "€": 600, "£": 600, "¥": 600, "·": 248, "’": 248, "‘": 248,
  "“": 443, "”": 443, "–": 500, "—": 1000, "…": 745, "é": 542,
};

const NUNITO900_ASCII = [
  286, 272, 515, 600, 600, 964, 766, 269, 407, 407, 456, 600, 272, 445, 272, 349,
  600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 272, 272, 600, 600, 600, 478,
  954, 763, 702, 688, 786, 614, 579, 747, 786, 312, 390, 712, 585, 884, 758, 807,
  676, 807, 706, 651, 644, 748, 742, 1128, 698, 645, 625, 401, 349, 401, 600, 500,
  399, 568, 620, 484, 620, 555, 402, 626, 606, 281, 287, 580, 348, 902, 606, 602,
  620, 620, 434, 496, 426, 601, 542, 868, 572, 541, 487, 438, 316, 438, 600,
];
const NUNITO900_EXTRA: Record<string, number> = {
  "€": 600, "£": 600, "¥": 600, "·": 272, "’": 272, "‘": 272,
  "“": 502, "”": 502, "–": 500, "—": 1000, "…": 816, "é": 555,
};

// A glyph the table doesn't know (a currency sign outside Latin-1, an emoji
// in a name) renders in a fallback font; budget it generously so a line
// that's measured as fitting really does.
const UNKNOWN = 700;

const TABLES: Record<FontId, { ascii: number[]; extra: Record<string, number> }> = {
  grobold: { ascii: GROBOLD_ASCII, extra: GROBOLD_EXTRA },
  nunito700: { ascii: NUNITO700_ASCII, extra: NUNITO700_EXTRA },
  nunito900: { ascii: NUNITO900_ASCII, extra: NUNITO900_EXTRA },
};

/** The CSS font-family stack for a font id, as it goes on an SVG <text>. */
export const FONT_FAMILY: Record<FontId, string> = {
  grobold: "Grobold, 'Arial Black', sans-serif",
  nunito700: "Nunito, 'SF Pro Rounded', -apple-system, Roboto, sans-serif",
  nunito900: "Nunito, 'SF Pro Rounded', -apple-system, Roboto, sans-serif",
};

/** The CSS font-weight the font id renders at. */
export const FONT_WEIGHT: Record<FontId, number> = {
  grobold: 400,
  nunito700: 700,
  nunito900: 900,
};

function glyphWidth(ch: string, font: FontId): number {
  const { ascii, extra } = TABLES[font];
  const code = ch.codePointAt(0)!;
  if (code >= 32 && code <= 126) {
    const w = ascii[code - 32];
    return w > 0 ? w : UNKNOWN;
  }
  return extra[ch] ?? UNKNOWN;
}

/** Width of `text` set in `font` at `size` px, with optional letter-spacing (px). */
export function textWidth(
  text: string,
  font: FontId,
  size: number,
  letterSpacing = 0,
): number {
  let units = 0;
  let glyphs = 0;
  // By code point, so a surrogate pair (an emoji in a name) counts once.
  for (const ch of text) {
    units += glyphWidth(ch, font);
    glyphs += 1;
  }
  return (units * size) / 1000 + Math.max(glyphs - 1, 0) * letterSpacing;
}

/**
 * Greedy word wrap: the fewest lines such that no line is wider than
 * `maxWidth`, breaking only at spaces. A single word wider than the box gets
 * a line to itself (it overflows rather than being cut). Explicit "\n" in
 * the text always breaks.
 */
export function wrapLines(
  text: string,
  font: FontId,
  size: number,
  maxWidth: number,
  letterSpacing = 0,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ").filter((w) => w.length > 0);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(candidate, font, size, letterSpacing) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export type FitOptions = {
  maxWidth: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  /** Shrink by this many px per attempt (default 2). */
  step?: number;
  letterSpacing?: number;
};

export type Fitted = { size: number; lines: string[] };

/**
 * The biggest font size, from `maxSize` down to `minSize`, at which `text`
 * wraps into at most `maxLines` lines that each fit `maxWidth`. When even
 * `minSize` can't manage it, the text is wrapped at `minSize` anyway and the
 * extra lines are dropped, the last kept line ending in an ellipsis — so a
 * pathological name can't push a card's footer off the bottom.
 */
export function fitText(text: string, font: FontId, opts: FitOptions): Fitted {
  const step = opts.step ?? 2;
  const ls = opts.letterSpacing ?? 0;
  for (let size = opts.maxSize; size >= opts.minSize; size -= step) {
    const lines = wrapLines(text, font, size, opts.maxWidth, ls);
    const fits =
      lines.length <= opts.maxLines &&
      lines.every((l) => textWidth(l, font, size, ls) <= opts.maxWidth);
    if (fits) return { size, lines };
  }
  const lines = wrapLines(text, font, opts.minSize, opts.maxWidth, ls).slice(
    0,
    opts.maxLines,
  );
  if (lines.length === opts.maxLines) {
    let last = lines[opts.maxLines - 1];
    while (
      last.length > 1 &&
      textWidth(`${last}…`, font, opts.minSize, ls) > opts.maxWidth
    ) {
      last = last.slice(0, -1);
    }
    lines[opts.maxLines - 1] = `${last}…`;
  }
  return { size: opts.minSize, lines };
}

/**
 * The font size at which a one-line value (an amount, a count, a name) fits
 * `maxWidth` exactly, capped at `maxSize`. Money is never cut short — "LL
 * 100,000,000" scales down instead of losing its digits — so there is no
 * floor here. Letter-spacing is a fixed gap per glyph, so it comes off the
 * width budget first and the glyphs scale into what's left.
 */
export function fitSingleLine(
  text: string,
  font: FontId,
  maxWidth: number,
  maxSize: number,
  letterSpacing = 0,
): number {
  const glyphs = textWidth(text, font, maxSize);
  const gaps = textWidth(text, font, maxSize, letterSpacing) - glyphs;
  if (glyphs + gaps <= maxWidth) return maxSize;
  return Math.max(1, Math.floor((maxSize * (maxWidth - gaps)) / glyphs));
}
