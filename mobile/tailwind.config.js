/** @type {import('tailwindcss').Config} */
// The web's tailwind.config.ts, carried over so every class name in the ported
// screens resolves to exactly the same value it does in the browser. Keep the
// two in sync: if a token changes in ../tailwind.config.ts, change it here.
//
// Only three things differ, and only because a phone isn't a browser:
//   • `content` points at this app's sources, and the NativeWind preset is on.
//   • `fontFamily` holds real font names, not CSS fallback stacks — React
//     Native picks one family, so each slot names the single face to use.
//   • The `safe-*` spacing tokens are gone: `env(safe-area-inset-*)` is CSS.
//     Safe areas come from react-native-safe-area-context (see ui/Screen).
//
// Concept: "an Apple app, hijacked by Bugs Bunny". The base is a plain,
// grouped-iOS surface (light gray canvas, white cards, SF type). The Looney
// Tunes energy comes from one loud accent — CARROT ORANGE — the Grobold cartoon
// display font on headers/branding, and money that finally gets to be green &
// red. Numbers stay Apple: friendly SF Pro Rounded with true tabular figures.
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // --- Plain Apple base (iOS "grouped" look) ---
        canvas: "#F2F2F7", // app background (systemGroupedBackground)
        surface: "#FFFFFF", // cards, sheets, rows
        grouped: "#E9E9EF", // numpad keys, inactive tiles, toggle tracks
        label: "#1C1C1E", // primary text, icons
        "label-muted": "#48484A", // softened dark grey — the wordmark
        "label-secondary": "#8E8E93", // captions, dates, placeholders
        separator: "rgba(60,60,67,0.12)", // disabled fills / faint hairlines

        // --- The hijack: carrot orange (the 🥕 emoji's orange) ---
        carrot: {
          DEFAULT: "#F56300", // THE brand accent — primary action, selection
          light: "#FF8A3D",
          soft: "#FFF1E6", // warm tint backgrounds
          dark: "#C44E00",
          leaf: "#5AA82F", // the carrot's greens (decorative only)
        },

        // --- Money gets color now: green up, red down ---
        income: "#34C759", // Apple system green — positive / money in
        expense: "#FF3B30", // Apple system red — negative / money out
        danger: "#FF3B30", // real errors (shares red)
      },
      fontFamily: {
        // Body / UI chrome = the platform face (the web's -apple-system stack).
        sans: ["System"],
        // Display = the cartoon hijack (Looney Tunes "Grobold"), reserved for
        // headers, the wordmark, and button labels. Loaded in App.tsx.
        display: ["Grobold"],
        // Numeric = all money/digits. The platform face; `tabular-nums` (see
        // fontVariant in the components) keeps columns from jittering.
        numeric: ["System"],
      },
      borderRadius: {
        card: "22px",
        pill: "9999px",
      },
      boxShadow: {
        // Light Apple elevation for white cards on the gray canvas.
        card: "0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)",
        // Lifted active segment in pill toggles.
        segment: "0 1px 3px rgba(0,0,0,0.12)",
        // Subtle carrot tint under the primary action.
        carrot: "0 2px 10px rgba(245,99,0,0.22)",
      },
      keyframes: {
        // Gentle entrance — small scale-in, no overshoot.
        "pop-in": {
          "0%": { transform: "scale(0.92)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        pop: "pop-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
