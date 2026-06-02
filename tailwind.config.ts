import type { Config } from "tailwindcss";

// Design tokens — see docs/DESIGN_SYSTEM.md for the rationale and usage rules.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Minimal monochrome (mibu-style)
        surface: "#FFFFFF",
        grouped: "#F2F2F2", // numpad keys, inactive tiles
        label: "#000000",
        "label-secondary": "#8E8E93",
        separator: "rgba(0,0,0,0.08)",
        // money values are monochrome — sign carries direction
        income: "#000000",
        expense: "#000000",
        // brand kept defined for future use; not applied anywhere now
        carrot: "#FF7A00",
        // surfaced separately so real errors stay visible
        danger: "#FF3B30",
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
