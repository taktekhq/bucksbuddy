// Design tokens — a COPY of ../tailwind.config.ts, so every class name in the
// ported screens resolves to exactly the value it does in the browser. Keep the
// two in step: if a token changes over there, change it here.
//
// Three things differ, and only because a phone isn't a browser:
//   • `content` points at this app's sources, and the NativeWind preset is on.
//   • `fontFamily` names single faces, not CSS fallback stacks — React Native
//     picks one family per slot, and on Android it names none at all (see the
//     note on `systemFont` below).
//   • The `safe-*` spacing tokens are gone: `env(safe-area-inset-*)` is CSS.
//     Safe areas come from react-native-safe-area-context (see ui/Screen).
//
// Concept: "an Apple app, hijacked by Bugs Bunny." The base is a plain,
// grouped-iOS surface (light gray canvas, white cards, SF type). The Looney
// Tunes energy comes from one loud accent — CARROT ORANGE — the Grobold cartoon
// display font on headers/branding, and money that finally gets to be green &
// red. Numbers stay Apple: friendly SF Pro Rounded with true tabular figures.
const plugin = require("tailwindcss/plugin");

// NativeWind compiles this file once per platform, with `NATIVEWIND_OS` set to
// the platform it is compiling for (see nativewind/dist/metro/tailwind/v3), so
// a build-time branch here is how a token says "Android is different". Its own
// shadow plugin uses the same switch.
const isAndroid = process.env.NATIVEWIND_OS === "android";

// The system font slot.
//
// On iOS, "System" is React Native's own alias for SF Pro, and RCTFont turns it
// into `[UIFont systemFontOfSize:weight:]` — the exact numeric weight, so
// `font-medium` is 500 and `font-semibold` is 600.
//
// On Android there is no family by that name, and naming ANY family is the
// problem: a non-null fontFamily sends React Native down ReactFontManager's
// asset lookup, which caches by Typeface's two-bit style and throws the numeric
// weight away (`nearestStyle` is NORMAL below 700, BOLD at or above it). Every
// `font-medium` and `font-semibold` in the app therefore came out as plain
// Roboto Regular, and the whole type hierarchy went flat.
//
// An empty list emits no `font-family` at all, and no family is what makes
// React Native take the other branch — `Typeface.create(DEFAULT, weight,
// italic)` — which honours the real weight. See src/test/tokens.styles.test.
const systemFont = isAndroid ? [] : ["System"];

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
        // Body / UI chrome = plain Apple (the platform's own font).
        sans: systemFont,
        // Display = the cartoon hijack (Looney Tunes "Grobold"), reserved for
        // headers, the wordmark, and button labels. Falls back to a rounded
        // system face while the self-hosted font loads.
        display: ["Grobold"],
        // Numeric = all money/digits. Stays on the platform font, with real
        // tabular figures so columns line up and nothing jitters or ghosts —
        // `tabular-nums` is what puts them there (see the plugin below).
        numeric: systemFont,
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
      // Android draws depth with `elevation`, not with a shadow triple, and
      // NativeWind derives one from the blur radius unless a token names it.
      // The blur radius is the wrong number: `shadow-carrot` is a 22%-opacity
      // TINT, and its 10px blur became elevation 10 — a hard black Material
      // shadow, at the depth Android reserves for a floating dialog, on the
      // app's primary button. Elevation also decides Android's stacking order,
      // so a 10 there lifted the button above things drawn after it. These are
      // the depths the web's shadows actually read as.
      elevation: {
        card: 2,
        segment: 2,
        carrot: 3,
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
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        // `tabular-nums` is the class the design system relies on for money —
        // "real tabular figures so columns line up and nothing jitters" — and
        // it was doing nothing at all. Tailwind emits `font-variant-numeric`,
        // which has no React Native equivalent, so it was dropped on both
        // platforms and every amount was drawn with proportional digits.
        // React Native spells it `fontVariant`, and wants a LIST — hence the
        // second entry, which is a no-op on SF Pro and Roboto (both are lining
        // by default) and is what makes this parse as an array rather than a
        // bare string.
        ".tabular-nums": { "-rn-font-variant": "tabular-nums, lining-nums" },

        // Android reserves extra room above and below the glyphs for ascenders
        // and descenders (`includeFontPadding`). iOS has no such thing, so the
        // same text sits lower on Android and a tight `leading-*` clips its
        // top — which is what the Grobold headers and the big amounts do. The
        // app already turns it off in `ui/Input`, which writes its own style;
        // these are the class-driven cases.
        ...(isAndroid
          ? {
              ".font-sans": { "-rn-include-font-padding": "false" },
              ".font-display": { "-rn-include-font-padding": "false" },
              ".font-numeric": { "-rn-include-font-padding": "false" },
              ".leading-none": { "-rn-include-font-padding": "false" },
              ".leading-tight": { "-rn-include-font-padding": "false" },
            }
          : {}),
      });
    }),
  ],
};
