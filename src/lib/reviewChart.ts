// The review room's chart ink: five marks, assigned by RANK, never by category.
//
// This exists because `categoryColor()` is the wrong palette for this screen,
// and wrong in a way that is hard to see in code and impossible to miss on
// screen. The category colours are drawn from the Apple system palette for the
// LIGHT screens, where they work — but several are byte-identical to colours
// this app has already given a meaning to:
//
//   groceries #34C759 IS the `income` token — "money in"
//   gas       #FF3B30 IS the `expense` token — "money out"
//   fun       #F56300 IS `carrot`, the accent
//   safe      #1FB85A IS the vault's deposit green
//   fees, rent, work, investment, refund are violet — the hue this room dropped
//
// On a screen whose entire subject is spending, that paints the biggest grocery
// bar in the colour that means money coming in and the fuel bar in the colour
// that means money going out. Three of them also fail the 3:1 floor for a
// graphical object on the review card (coffee 2.4:1, rent and work 2.4:1).
//
// So inside this room a series takes the slot its RANK earns — slot 1 is the
// largest share — and the room's own scale is the only palette on screen. The
// house rule that green and red belong to money (docs/DESIGN_SYSTEM.md) then
// holds here too: nothing in a chart is green or red, so nothing in a chart can
// be misread as a direction.
//
// HOW THE FIVE WERE CHOSEN, since "pick five blues" is not a spec:
//
// Under simulated protanopia and deuteranopia every cool hue in this room
// collapses to one hue and every warm hue to another, so within a family only
// LIGHTNESS separates two marks. A mark must also clear 3:1 on the card
// (L* >= 49) and stay below the type, which leaves a usable band of L* 49–92.
// Income, expense and carrot already occupy the warm family's L* 45–75, so
// there is exactly one warm slot left, up at L* >= 87, and the rest must be
// cool and spaced about 12 L* apart. Five is the honest ceiling: the worst-case
// separation across normal, protanopic and deuteranopic vision is ΔE 10.5, for
// slots 1 and 2 — which is why those are the two LARGEST shares, the two a
// reader identifies by bar length anyway.
//
// The rule that goes with it: HUE IS NEVER THE ONLY CARRIER. Every chart here
// prints a lucide icon, a text label and a formatted value on the same row.

/** Contrast on `review-card` (#10314A) in the comment beside each. */
export const CHART_RAMP = [
  "#BBDCF5", // pale ice — 9.4:1
  "#5AC4D6", // aqua — 6.6:1
  "#4C9AE2", // azure — 4.5:1
  "#7E6FDC", // periwinkle — 3.3:1 on the card, and only 2.7:1 on `review-tile`
  "#F2DC9B", // straw — 9.9:1; the one warm slot
] as const;

/**
 * Everything past the fifth slot, and the "other" bucket: the room's own muted
 * caption colour, dimmed, so a tail of small shares reads as a tail rather than
 * as five more categories.
 */
export const CHART_REST = "#A8C2D866";

/**
 * The colour for rank `i`, zero-based. Ranks past the ramp share CHART_REST —
 * they are the tail, and giving each its own hue would claim a distinction the
 * eye cannot make at that size anyway.
 */
export function rampColor(i: number): string {
  return CHART_RAMP[i] ?? CHART_REST;
}

/**
 * The ink for a single-series chart — the month bars and the hero's wash. Slot
 * 2, because slot 1 is nearly white and a full-height bar in it would read as
 * a block of paper rather than as data.
 */
export const CHART_INK = CHART_RAMP[1];

/**
 * Slot 4 is the one mark that does NOT clear 3:1 on `review-tile` (2.7:1), so
 * it must never paint inside a figure pill. Nothing does today; this is the
 * constant to check against if something starts to.
 */
export const CHART_TILE_UNSAFE = CHART_RAMP[3];
