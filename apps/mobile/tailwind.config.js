// Mirrors ../../tailwind.config.ts (the web app's design tokens — see
// docs/DESIGN_SYSTEM.md for the rationale) so NativeWind classNames read
// identically to the web app's. Kept as a separate file rather than a shared
// import because NativeWind's own content globs and a few web-only tokens
// (CSS keyframes, `env()` safe-area spacing — RN has no CSS environment, see
// react-native-safe-area-context usage instead) don't translate directly.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: "#F2F2F7",
        surface: "#FFFFFF",
        grouped: "#E9E9EF",
        label: "#1C1C1E",
        "label-muted": "#48484A",
        "label-secondary": "#8E8E93",
        separator: "rgba(60,60,67,0.12)",

        carrot: {
          DEFAULT: "#F56300",
          light: "#FF8A3D",
          soft: "#FFF1E6",
          dark: "#C44E00",
          leaf: "#5AA82F",
        },

        income: "#34C759",
        expense: "#FF3B30",
        danger: "#FF3B30",
      },
      fontFamily: {
        // display is the one bundled face — loaded via expo-font in
        // _layout.tsx, see assets/fonts/Grobold.ttf.
        //
        // sans is left unset: RN's platform default *is* San Francisco on
        // iOS already (what "-apple-system" resolves to on web), so setting
        // it to anything would be a regression, not a fix.
        //
        // numeric names "SF Pro Rounded" directly — on iOS this isn't a
        // bundled file, it's one of CoreText's built-in system font designs,
        // resolvable by name with zero setup (the same reason apps can use
        // "SF Pro Rounded" in RN's StyleSheet with no font-loading step at
        // all). Falls back to Android's default (Roboto) there, same as the
        // web stack already does off-Apple — not a native-only gap.
        numeric: ["SF Pro Rounded"],
        display: ["Grobold"],
      },
      borderRadius: {
        card: "22px",
        pill: "9999px",
      },
    },
  },
  plugins: [],
};
