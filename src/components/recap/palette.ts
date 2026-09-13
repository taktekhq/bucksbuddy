// Color math for the Recap card. Each month's card takes its colors from
// the leading category (the same hex as its icon everywhere else in the
// app), so a Coffee month is a latte card and a Parking month a teal one.
// Everything here is plain arithmetic on hex strings — no DOM, no CSS.

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** `hex` moved `amount` (0..1) of the way toward `toward`. */
export function mix(hex: string, toward: string, amount: number): string {
  const a = toRgb(hex);
  const b = toRgb(toward);
  return toHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

export const darken = (hex: string, amount: number) => mix(hex, "#000000", amount);
export const lighten = (hex: string, amount: number) => mix(hex, "#ffffff", amount);

/** Relative luminance, 0 (black) … 1 (white), per WCAG. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type CardPalette = {
  base: string; // the category color itself
  ground: string; // the card's paper: a whisper of the color on off-white
  ink: string; // dark version of the color for titles and numbers
  soft: string; // a pale tint for chips and bars
  glow: string; // a lighter version for gradient highlights
  onBase: string; // text that reads on the base color
};

/** The card palette for a category color. */
export function cardPalette(base: string): CardPalette {
  return {
    base,
    ground: mix(base, "#fffbf5", 0.86),
    ink: darken(base, 0.52),
    soft: mix(base, "#ffffff", 0.78),
    glow: lighten(base, 0.28),
    // Yellow-ish categories (Tips) are bright enough to need dark text.
    onBase: luminance(base) > 0.5 ? darken(base, 0.7) : "#ffffff",
  };
}

/** The streak flame's color: grey until a week, then bronze, silver, gold. */
export function flameColor(streak: number): string {
  if (streak >= 21) return "#E0A400";
  if (streak >= 14) return "#9AA3AF";
  if (streak >= 7) return "#B0793A";
  return "#8E8E93";
}

// The foil colors per rarity — the frame and sheens are where a card's
// rarity shows. Common has no foil at all: its frame is the plain type color.
export const FOIL = {
  silver: ["#cfd6e0", "#ffffff", "#aeb8c6", "#f4f7fb", "#b9c2cf"],
  holo: ["#ff8a8a", "#ffd36e", "#8affb0", "#7fd7ff", "#c69cff", "#ff8ad4"],
  gold: ["#f2c14e", "#fff1b8", "#d99a1e", "#ffe27a", "#b8781a"],
};
