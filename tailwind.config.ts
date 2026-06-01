import type { Config } from "tailwindcss";

// Design tokens — see docs/DESIGN_SYSTEM.md for the rationale and usage rules.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm, carrot-accented surfaces
        surface: "#FFFFFF",
        grouped: "#FAF6F0", // warm cream page background
        label: "#1A1714", // warm near-black
        "label-secondary": "#7A7269", // warm gray
        separator: "rgba(122,114,105,0.18)", // warm, low-contrast
        // semantic money colors
        income: "#34C759",
        expense: "#E5484D",
        // BucksBuddy primary accent (carrot)
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
