import type { Config } from "tailwindcss";

// Design tokens — see docs/DESIGN_SYSTEM.md for the rationale and usage rules.
//
// Concept: "an Apple app, hijacked by Bugs Bunny." The base is a plain,
// grouped-iOS surface (light gray canvas, white cards, SF type). The Looney
// Tunes energy comes from one loud accent — CARROT ORANGE — the Grobold cartoon
// display font on headers/branding, and money that finally gets to be green &
// red. Numbers stay Apple: friendly SF Pro Rounded with true tabular figures.
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

        // --- The review's own dark room ---
        // A second dark world: a calm deep blue, the colour of a reading lamp
        // rather than of money. Blue is the one hue this app has not already
        // spent — the Safe is a green vault, savings are green and gold, money
        // is green and red, and the accent is carrot — so a blue room is never
        // mistaken for a balance or a verdict.
        //
        // The floor is the load-bearing value here, and it is deliberately not
        // near-black. Below about L* 10 a blue this saturated reads as black,
        // and the app already has two near-black rooms — the observatory indigo
        // behind Stats, Receipts and Recurring (#23234A → #141428, floor L* 7.2)
        // and History's charcoal (#1C1C1E) — so a darker floor would lose the
        // room's identity over the bottom two-thirds of a scroll and land on top
        // of both. #0A2233 sits at L* 12.3 with the hue still visible.
        //
        // Every text pair clears WCAG AA on every ground it is used on (ratios
        // on the card noted). Carrot clears the 3:1 non-text floor everywhere
        // here, so carrot ICONS and FILLS are legal in this room; carrot as
        // WORDS only clears 4.5:1 on `ink` and `mid`, so use `carrot-light`
        // (#FF8A3D, 5.74:1 on the card) for any carrot text after dark.
        review: {
          top: "#123A56", // gradient top, and the status-bar tint
          mid: "#0D2C42", // gradient middle
          ink: "#0A2233", // gradient end, and the floor behind everything
          card: "#10314A", // cards and rows
          tile: "#17415E", // figure tiles — `grouped`, after dark
          text: "#F2F7FB", // primary text — 12.5:1 on card
          muted: "#A8C2D8", // captions — 7.3:1 on card
        },
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
        // Display = the cartoon hijack (Looney Tunes "Grobold"), reserved for
        // headers, the wordmark, and button labels. Falls back to a rounded
        // system face while the self-hosted font loads.
        display: [
          "Grobold",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Rounded",
          "Segoe UI",
          "sans-serif",
        ],
        // Numeric = all money/digits. Stays Apple — friendly SF Pro Rounded with
        // real tabular figures so columns line up and nothing jitters or ghosts.
        numeric: [
          "SF Pro Rounded",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
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
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
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

export default config;
