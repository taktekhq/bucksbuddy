import { describe, it, expect } from "vitest";
import {
  CHART_INK,
  CHART_RAMP,
  CHART_REST,
  CHART_TILE_UNSAFE,
  rampColor,
} from "@/lib/reviewChart";
import { categoryColor, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";

// WCAG 2.x relative luminance, sRGB.
function luminance(hex: string): number {
  const h = hex.replace("#", "").slice(0, 6);
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const CARD = "#10314A"; // review-card
const TILE = "#17415E"; // review-tile
const INCOME = "#34C759";
const EXPENSE = "#FF3B30";
const CARROT = "#F56300";

/** The 3:1 floor WCAG sets for a graphical object such as a chart mark. */
const GRAPHIC_FLOOR = 3;

describe("CHART_RAMP", () => {
  it("has five slots", () => {
    // Five is the ceiling, not a shortfall: under red-green colour blindness
    // every cool hue in this room collapses to one hue and every warm hue to
    // another, so within a family only lightness separates two marks — and the
    // warm family is already occupied by income, expense and carrot.
    expect(CHART_RAMP).toHaveLength(5);
  });

  it("clears the 3:1 graphical floor on the card", () => {
    for (const color of CHART_RAMP) {
      expect(contrast(color, CARD)).toBeGreaterThanOrEqual(GRAPHIC_FLOOR);
    }
  });

  it("names the one slot that must not paint inside a figure tile", () => {
    // Slot 4 is legal on the card and NOT on the lighter tile. The constant
    // exists so this stays a checked fact rather than a comment.
    expect(contrast(CHART_TILE_UNSAFE, TILE)).toBeLessThan(GRAPHIC_FLOOR);
    for (const color of CHART_RAMP) {
      if (color === CHART_TILE_UNSAFE) continue;
      expect(contrast(color, TILE)).toBeGreaterThanOrEqual(GRAPHIC_FLOOR);
    }
  });

  it("is never one of the colours that already mean something", () => {
    // The whole point of the room being blue: nothing in a chart can be read as
    // a direction, a balance, or the accent.
    for (const color of CHART_RAMP) {
      expect([INCOME, EXPENSE, CARROT]).not.toContain(color);
    }
  });

  it("draws a single-series chart in a slot that is not nearly white", () => {
    expect(CHART_INK).toBe(CHART_RAMP[1]);
    expect(luminance(CHART_INK)).toBeLessThan(luminance(CHART_RAMP[0]));
  });
});

describe("rampColor", () => {
  it("gives each of the first five ranks its own slot", () => {
    const used = [0, 1, 2, 3, 4].map(rampColor);
    expect(used).toEqual([...CHART_RAMP]);
    expect(new Set(used).size).toBe(5);
  });

  it("shares one colour across the tail", () => {
    // Past the fifth rank the shares are small enough that a distinct hue each
    // would claim a distinction the eye cannot make at that size.
    expect(rampColor(5)).toBe(CHART_REST);
    expect(rampColor(40)).toBe(CHART_REST);
  });
});

describe("why this exists rather than categoryColor", () => {
  it("proves the category palette carries money's own colours", () => {
    // This is the defect the ramp replaces, asserted rather than described: on
    // a screen whose whole subject is spending, the biggest grocery bar would
    // paint in the colour that means money coming IN, and fuel in the colour
    // that means money going OUT.
    expect(categoryColor("groceries")).toBe(INCOME);
    expect(categoryColor("salary")).toBe(INCOME);
    expect(categoryColor("gas")).toBe(EXPENSE);
    expect(categoryColor("fun")).toBe(CARROT);
  });

  it("proves some category colours cannot be seen on this card at all", () => {
    // Below 3:1 a bar is not a bar. These are fine on the light screens they
    // were designed for.
    for (const id of ["coffee", "rent", "work"]) {
      expect(contrast(categoryColor(id), CARD)).toBeLessThan(GRAPHIC_FLOOR);
    }
  });

  it("checks every category, so a new one cannot quietly reintroduce the problem", () => {
    const offenders = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].filter(
      (c) =>
        [INCOME, EXPENSE, CARROT].includes(c.color) ||
        contrast(c.color, CARD) < GRAPHIC_FLOOR,
    );
    // Not zero — that is the point. The assertion is that the list is
    // non-empty, which is why this room does not use those colours.
    expect(offenders.length).toBeGreaterThan(0);
  });
});
