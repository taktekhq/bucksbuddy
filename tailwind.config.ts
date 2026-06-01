import type { Config } from "tailwindcss";

// Design tokens — see docs/DESIGN_SYSTEM.md for the rationale and usage rules.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // iOS-neutral base
        surface: "#FFFFFF",
        grouped: "#F2F2F7", // iOS systemGroupedBackground
        label: "#000000",
        "label-secondary": "rgba(60,60,67,0.6)",
        separator: "rgba(60,60,67,0.29)",
        // semantic money colors (iOS systemGreen / systemRed)
        income: "#34C759",
        expense: "#FF3B30",
        // BucksBuddy playful accent (carrot)
        carrot: "#FF7A00",
      },
      fontFamily: {
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
      },
      borderRadius: {
        card: "20px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
    },
  },
  plugins: [],
};

export default config;
