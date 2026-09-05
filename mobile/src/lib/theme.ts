// Design tokens — a 1:1 port of tailwind.config.ts + index.css from the PWA.
// "An Apple app, hijacked by Bugs Bunny": plain grouped-iOS base, one loud
// carrot accent, Grobold for the cartoon hijack, money in green and red.
import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const colors = {
  // --- Plain Apple base (iOS "grouped" look) ---
  canvas: "#F2F2F7",
  surface: "#FFFFFF",
  grouped: "#E9E9EF",
  label: "#1C1C1E",
  labelMuted: "#48484A",
  labelSecondary: "#8E8E93",
  separator: "rgba(60,60,67,0.12)",

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
  card: 22,
  pill: 9999,
  lg: 8,
  sm: 2,
} as const;

// Tailwind's 4pt scale: p-1 = 4, p-2 = 8, … used verbatim below so a `px-4`
// in the web source reads as `space(4)` here.
export const space = (n: number) => n * 4;

// Font families. Grobold is self-hosted (assets/fonts). Body/UI text is the
// platform font, same as the SF stack on the web. The numeric face maps to
// the system font with true tabular figures.
export const fonts = {
  display: "Grobold",
  sans: Platform.select({ ios: "System", android: "sans-serif", default: "System" })!,
  numeric: Platform.select({ ios: "System", android: "sans-serif", default: "System" })!,
} as const;

export const numeric: TextStyle = {
  fontFamily: fonts.numeric,
  fontVariant: ["tabular-nums"],
};

export const display: TextStyle = {
  fontFamily: fonts.display,
  textTransform: "uppercase",
};

// Light Apple elevation for white cards on the gray canvas.
export const shadowCard: ViewStyle = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 1.5 },
  default: {},
})!;

// Lifted active segment in pill toggles.
export const shadowSegment: ViewStyle = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  android: { elevation: 1 },
  default: {},
})!;

// Subtle carrot tint under the primary action.
export const shadowCarrot: ViewStyle = Platform.select({
  ios: {
    shadowColor: colors.carrot,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 2 },
  default: {},
})!;

// Tailwind's named text sizes → [fontSize, lineHeight].
export const text = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 28 },
  xl: { fontSize: 20, lineHeight: 28 },
  "2xl": { fontSize: 24, lineHeight: 32 },
  "3xl": { fontSize: 30, lineHeight: 36 },
  "4xl": { fontSize: 36, lineHeight: 40 },
  "5xl": { fontSize: 48, lineHeight: 48 },
  "6xl": { fontSize: 60, lineHeight: 60 },
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
