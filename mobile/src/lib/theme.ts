// The handful of token values that can't be expressed as a class name.
//
// Styling lives in class names now (see tailwind.config.js, shared with the
// web), so this file is deliberately small: it exists for the places React
// Native takes a color as a *prop* rather than a style — lucide icons
// (`color=`), LinearGradient stops, TextInput's `placeholderTextColor` — and
// for the page gradients, which have no class equivalent.
//
// Every value here also exists in tailwind.config.js. Keep them in step.
export const colors = {
  canvas: "#F2F2F7",
  surface: "#FFFFFF",
  grouped: "#E9E9EF",
  label: "#1C1C1E",
  labelMuted: "#48484A",
  labelSecondary: "#8E8E93",
  separator: "rgba(60,60,67,0.12)",
  carrot: "#F56300",
  carrotLight: "#FF8A3D",
  carrotSoft: "#FFF1E6",
  carrotDark: "#C44E00",
  carrotLeaf: "#5AA82F",
  income: "#34C759",
  expense: "#FF3B30",
  danger: "#FF3B30",
  white: "#FFFFFF",
} as const;

// The page gradients. On the web these are `linear-gradient(180deg, …)` on the
// scrolling <main>, with a fixed floor behind in the terminal color so an
// overscroll bounce never flashes the light canvas. `stops` are the web's
// pixel offsets, verbatim.
export type Gradient = {
  colors: readonly [string, string, ...string[]];
  stops: readonly number[];
  floor: string;
};

/** History — the charcoal "rabbit hole". */
export const RABBIT_HOLE: Gradient = {
  colors: ["#2C2C2E", "#232325", "#1C1C1E"],
  stops: [0, 220, 460],
  floor: "#1C1C1E",
};

/** Stats + Receipts — the indigo "observatory". */
export const OBSERVATORY: Gradient = {
  colors: ["#23234A", "#1B1B38", "#141428"],
  stops: [0, 220, 460],
  floor: "#141428",
};

/** The Safe — the deep green "vault". */
export const VAULT: Gradient = {
  colors: ["#0E4A37", "#0A3A2A", "#06281E"],
  stops: [0, 320, 640],
  floor: "#06281E",
};

/** Home's savings tint, shown when there's money or gold tucked away. */
export const SAVINGS: Gradient = {
  colors: ["#E6F8EE", "#F2F2F7"],
  stops: [0, 260],
  floor: colors.canvas,
};

// Durations from the web's CSS, for the few animations that are driven in JS
// rather than by a `transition-*`/`duration-*` class.
export const motion = {
  press: 100, // .press — transform 0.1s ease
  transition: 150, // Tailwind's `transition`
  snap: 160, // swipe snap — 0.16s cubic-bezier(0.2, 0, 0, 1)
  snapEase: [0.2, 0, 0, 1] as const,
  pop: 220, // stack expand / pop-in — 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)
  popEase: [0.2, 0.8, 0.2, 1] as const,
  sheet: 250, // bottom sheet slide
  tint: 500, // Home's savings tint
} as const;

/** Hex + alpha (0..1) → "#RRGGBBAA", for the `${color}1A` pattern the web uses
 *  on per-category data colors (which are data, not theme — see the design
 *  system), where a class name can't be built ahead of time. */
export const withAlpha = (hex: string, alpha: number) =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase()}`;
