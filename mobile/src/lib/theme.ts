// Design tokens — a 1:1 port of tailwind.config.ts + index.css from the PWA.
// "An Apple app, hijacked by Bugs Bunny": plain grouped-iOS base, one loud
// carrot accent, Grobold for the cartoon hijack, money in green and red.
//
// Every value here is the web value. Shadows are CSS box-shadow strings —
// React Native's new architecture renders them verbatim (layered, inset, the
// lot), so `shadow-card` on the web and `shadows.card` here are the same
// pixels. Rings (`ring-1 ring-inset ring-white/5`) are inset box shadows too,
// so they never eat into layout the way a border would.
import { Platform, type TextStyle } from "react-native";

export const colors = {
  // --- Plain Apple base (iOS "grouped" look) ---
  canvas: "#F2F2F7", // app background (systemGroupedBackground)
  surface: "#FFFFFF", // cards, sheets, rows
  grouped: "#E9E9EF", // numpad keys, inactive tiles, toggle tracks
  label: "#1C1C1E", // primary text, icons
  labelMuted: "#48484A", // softened dark grey — the wordmark
  labelSecondary: "#8E8E93", // captions, dates, placeholders
  separator: "rgba(60,60,67,0.12)", // disabled fills / faint hairlines

  // --- The hijack: carrot orange ---
  carrot: "#F56300",
  carrotLight: "#FF8A3D",
  carrotSoft: "#FFF1E6",
  carrotDark: "#C44E00",
  carrotLeaf: "#5AA82F",

  // --- Money ---
  income: "#34C759",
  expense: "#FF3B30",
  danger: "#FF3B30",
  white: "#FFFFFF",
} as const;

export const radius = {
  card: 22, // rounded-card
  pill: 9999, // rounded-pill
  sheet: 28, // rounded-t-[28px]
  lg: 8, // rounded-lg
  sm: 2, // rounded-sm
} as const;

// Tailwind's 4pt scale: `p-1` = space(1) = 4, `px-3.5` = space(3.5) = 14.
export const space = (n: number) => n * 4;

// CSS box-shadow strings, verbatim from tailwind.config.ts / the class names.
export const shadows = {
  // shadow-card — light Apple elevation for white cards on the gray canvas.
  card: "0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)",
  // shadow-segment — lifted active segment in pill toggles.
  segment: "0 1px 3px rgba(0,0,0,0.12)",
  // shadow-carrot — subtle carrot tint under the primary action.
  carrot: "0 2px 10px rgba(245,99,0,0.22)",
  // ring-1 ring-inset ring-white/5 — the faint edge on charcoal cards.
  ringWhite5: "inset 0 0 0 1px rgba(255,255,255,0.05)",
  // ring-1 ring-inset ring-white/10 — the Safe's vault cards and rows.
  ringWhite10: "inset 0 0 0 1px rgba(255,255,255,0.1)",
  // ring-1 ring-income/40 — the encryption-on card.
  ringIncome40: "0 0 0 1px rgba(52,199,89,0.4)",
} as const;

// Font families. Grobold is self-hosted (assets/fonts, loaded in App.tsx).
// Body/UI text is the platform font, same as the SF stack on the web. The
// numeric face maps to the system font with true tabular figures.
export const fonts = {
  display: "Grobold",
  sans: Platform.select({ ios: "System", android: "sans-serif", default: "System" })!,
  numeric: Platform.select({ ios: "System", android: "sans-serif", default: "System" })!,
} as const;

// `font-numeric tabular-nums` — all money/digits.
export const numeric: TextStyle = {
  fontFamily: fonts.numeric,
  fontVariant: ["tabular-nums"],
};

// `font-display uppercase` — the cartoon hijack. Grobold ships one weight, so
// never pair it with fontWeight (that's the faux-bold look the web disables
// with font-synthesis: none).
export const display: TextStyle = {
  fontFamily: fonts.display,
  textTransform: "uppercase",
};

// Tailwind's named text sizes → { fontSize, lineHeight }. `text-[13px]`-style
// arbitrary sizes use the default leading of the nearest step (1.5 → 20).
export const text = {
  "10": { fontSize: 10, lineHeight: 14 }, // text-[10px]
  "11": { fontSize: 11, lineHeight: 15 }, // text-[11px]
  xs: { fontSize: 12, lineHeight: 16 },
  "13": { fontSize: 13, lineHeight: 18 }, // text-[13px]
  sm: { fontSize: 14, lineHeight: 20 },
  "15": { fontSize: 15, lineHeight: 22 }, // text-[15px]
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 28 },
  xl: { fontSize: 20, lineHeight: 28 },
  "2xl": { fontSize: 24, lineHeight: 32 },
  "3xl": { fontSize: 30, lineHeight: 36 },
  "4xl": { fontSize: 36, lineHeight: 40 },
  "5xl": { fontSize: 48, lineHeight: 48 },
  "6xl": { fontSize: 60, lineHeight: 60 },
} as const;

// Tailwind leading-* as a lineHeight for a given fontSize.
export const leading = {
  none: (size: number) => size,
  tight: (size: number) => size * 1.25,
  snug: (size: number) => size * 1.375,
  relaxed: (size: number) => size * 1.625,
};

// `tracking-wide` = 0.025em, as points for a given fontSize.
export const trackingWide = (fontSize: number) => fontSize * 0.025;

// Font weights, as the web's classes.
export const weight = {
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

// Motion — the web's easings, as Reanimated-friendly numbers.
export const motion = {
  // `.press` — transform 0.1s ease.
  press: 100,
  // `transition` (Tailwind) — 150ms.
  transition: 150,
  // Swipe snap — quick tween, no overshoot: 0.16s cubic-bezier(0.2, 0, 0, 1).
  snap: 160,
  snapEase: [0.2, 0, 0, 1] as const,
  // Stack expand / pop-in — 0.22s cubic-bezier(0.2, 0.8, 0.2, 1).
  pop: 220,
  popEase: [0.2, 0.8, 0.2, 1] as const,
  // Sheet slide — 0.25s, same curve.
  sheet: 250,
} as const;

/** "rgba(255,255,255,a)" — Tailwind's `white/NN`. */
export const white = (alpha: number) => `rgba(255,255,255,${alpha})`;
/** "rgba(0,0,0,a)" — Tailwind's `black/NN`. */
export const black = (alpha: number) => `rgba(0,0,0,${alpha})`;
/** Hex color + alpha (0..1) → "#RRGGBBAA", like the web's `${color}1A`. */
export const withAlpha = (hex: string, alpha: number) =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase()}`;
