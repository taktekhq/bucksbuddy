import type { Config } from "tailwindcss";

// Design tokens — see docs/DESIGN_SYSTEM.md for the rationale and usage rules.
//
// Concept: "an Apple app, hijacked by Bugs Bunny." The base is a plain,
// grouped-iOS surface (light gray canvas, white cards, SF type). The Looney
// Tunes energy comes from one loud accent — CARROT ORANGE — a bouncy display
// font, springy cartoon motion, and money that finally gets to be green & red.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- Plain Apple base (iOS "grouped" look) ---
        canvas: "#F2F2F7", // app background (systemGroupedBackground)
        surface: "#FFFFFF", // cards, sheets, rows
        grouped: "#E9E9EF", // numpad keys, inactive tiles, toggle tracks
        label: "#1C1C1E", // primary text, icons
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
        // Body / UI chrome = plain Apple.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Display = the cartoon hijack (rounded, bouncy). Falls back to system.
        display: [
          "Fredoka",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Rounded",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "22px",
        pill: "9999px",
      },
      boxShadow: {
        // Soft Apple elevation for white cards on the gray canvas.
        card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
        // Lifted active segment in pill toggles.
        segment: "0 1px 3px rgba(0,0,0,0.12)",
        // Carrot "pop" under the primary action.
        carrot: "0 6px 18px rgba(245,99,0,0.35)",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
      keyframes: {
        // Cartoon entrance — overshoot then settle.
        "pop-in": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // The carrot can't sit still.
        wiggle: {
          "0%, 100%": { transform: "rotate(-7deg)" },
          "50%": { transform: "rotate(7deg)" },
        },
        // Splash hop.
        hop: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14%)" },
        },
      },
      animation: {
        pop: "pop-in 0.32s cubic-bezier(0.2, 0.9, 0.2, 1.2)",
        wiggle: "wiggle 0.5s ease-in-out",
        hop: "hop 0.9s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
