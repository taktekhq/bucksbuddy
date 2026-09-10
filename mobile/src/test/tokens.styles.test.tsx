// What the type and depth tokens MEAN on each platform.
//
// Every fix in here is invisible to a class-name assertion, because no class
// name changed — the same `font-numeric font-semibold` that looked right on an
// iPhone was drawing plain Roboto Regular on Android. The bugs lived in what
// the tokens compiled to, one platform at a time, so this file compiles the
// real config twice and reads the output. See src/test/tailwind for why
// reaching for the compiler is the only way a test gets to see this.
//
// The assertions are on the compiled CSS rather than on resolved style objects
// because NativeWind's test registry is global and merges every stylesheet
// handed to it — two platforms cannot be live at once. One runtime check at the
// bottom covers the part CSS alone cannot show: that the `-rn-*` declarations
// really do become React Native style props.
import { View } from "react-native";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { render, screen } from "@testing-library/react-native";
import { registerCSS, setupAllComponents } from "react-native-css-interop/dist/test";

const CONFIG = require.resolve("../../tailwind.config.js");

// Every class this file asks about, compiled in one pass per platform.
const CLASSES = [
  "font-sans",
  "font-numeric",
  "font-display",
  "tabular-nums",
  "leading-none",
  "leading-tight",
  "shadow-card",
  "shadow-segment",
  "shadow-carrot",
];

/**
 * NativeWind compiles the config once per platform with `NATIVEWIND_OS` set
 * (nativewind/dist/metro/tailwind/v3), and both its preset and ours branch on
 * it — so the platform has to be in the environment, and our config re-read,
 * before Tailwind resolves anything.
 */
async function cssFor(platform: "ios" | "android"): Promise<string> {
  const previous = process.env.NATIVEWIND_OS;
  process.env.NATIVEWIND_OS = platform;
  let compiled = "";
  try {
    // Jest keeps its own module registry, so `require.cache` is not the one
    // that matters — without a fresh one the config is handed back from the
    // first platform that asked for it and the second compile silently repeats
    // the first. `isolateModulesAsync` scopes that reset to this call, so the
    // components NativeWind has already wired up for rendering survive it.
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const config = require(CONFIG);
      const { css } = await postcss([
        tailwind({
          ...config,
          content: [{ raw: `<div class="${CLASSES.join(" ")}"/>`, extension: "html" }],
        }),
      ]).process("@tailwind utilities;", { from: undefined });
      compiled = css;
    });
  } finally {
    if (previous === undefined) delete process.env.NATIVEWIND_OS;
    else process.env.NATIVEWIND_OS = previous;
  }
  return compiled;
}

/** Every declaration a class name carries, across all the rules that define it. */
function declarations(css: string, className: string): Record<string, string> {
  const found: Record<string, string> = {};
  postcss.parse(css).walkRules((rule) => {
    const selectors = rule.selector.split(",").map((s) => s.trim());
    if (!selectors.includes(`.${className}`)) return;
    rule.walkDecls((decl) => {
      found[decl.prop] = decl.value;
    });
  });
  return found;
}

const compiled: Record<"ios" | "android", string> = { ios: "", android: "" };
beforeAll(async () => {
  compiled.ios = await cssFor("ios");
  compiled.android = await cssFor("android");
});

const on = (platform: "ios" | "android", className: string) =>
  declarations(compiled[platform], className);

describe("the system font slot, on Android", () => {
  // The headline bug. A non-null fontFamily sends React Native down
  // ReactFontManager's asset lookup, which caches by Typeface's two-bit style
  // and throws the numeric weight away — so `font-medium` and `font-semibold`
  // both came out as Roboto Regular and the type hierarchy went flat. Naming
  // no family is what makes React Native take the other branch,
  // `Typeface.create(DEFAULT, weight, italic)`, which honours the real weight.
  it("names no family, so the platform font keeps its real weights", () => {
    // An empty declaration is how the slot says "nothing"; the runtime check at
    // the bottom is what shows React Native ends up with no fontFamily at all.
    expect(on("android", "font-sans")["font-family"]).toBeFalsy();
    expect(on("android", "font-numeric")["font-family"]).toBeFalsy();
  });

  it("still names Grobold, which is a real registered family", () => {
    expect(on("android", "font-display")["font-family"]).toBe("Grobold");
  });
});

describe("the system font slot, on iOS", () => {
  it('keeps "System", which is how RCTFont is asked for SF Pro at an exact weight', () => {
    expect(on("ios", "font-sans")["font-family"]).toBe("System");
    expect(on("ios", "font-numeric")["font-family"]).toBe("System");
    expect(on("ios", "font-display")["font-family"]).toBe("Grobold");
  });
});

describe("Android's extra glyph padding", () => {
  // Android reserves room above and below the glyphs for ascenders and
  // descenders; iOS has no such thing. The same text therefore sits lower on
  // Android, and a tight `leading-*` clips its top.
  it.each(["font-sans", "font-display", "font-numeric", "leading-none", "leading-tight"])(
    "is off for %s",
    (className) => {
      expect(on("android", className)["-rn-include-font-padding"]).toBe("false");
    },
  );

  it("is not mentioned on iOS, which has none to turn off", () => {
    expect(on("ios", "font-numeric")["-rn-include-font-padding"]).toBeUndefined();
    expect(on("ios", "leading-none")["-rn-include-font-padding"]).toBeUndefined();
  });
});

describe("depth", () => {
  // Elevation is Android's depth AND its stacking order, and NativeWind derives
  // one from the shadow's blur radius unless a token names it. That is the
  // wrong number: `shadow-carrot` is a 22%-opacity TINT, and its 10px blur
  // became elevation 10 — a hard black shadow at the depth Android reserves
  // for a floating dialog, under the app's primary button, drawn above its
  // neighbours.
  const elevationOf = (className: string) =>
    parseFloat(on("android", className)["-rn-elevation"]);

  it("gives each Android surface the depth the web's shadow reads as", () => {
    expect(elevationOf("shadow-card")).toBe(2);
    expect(elevationOf("shadow-segment")).toBe(2);
    expect(elevationOf("shadow-carrot")).toBe(3);
  });

  it("leaves iOS on its shadow triple, with no elevation", () => {
    expect(on("ios", "shadow-carrot")["-rn-elevation"]).toBeUndefined();
    expect(on("ios", "shadow-carrot")["-rn-shadow-color"]).toBe("var(--tw-shadow-color)");
  });
});

describe("tabular-nums", () => {
  // Tailwind compiles it to `font-variant-numeric`, which has no React Native
  // equivalent and was dropped — so the class the design system leans on for
  // money ("real tabular figures so columns line up and nothing jitters") was
  // silently doing nothing, on either platform.
  it.each(["ios", "android"] as const)("asks %s for real tabular figures", (platform) => {
    expect(on(platform, "tabular-nums")["-rn-font-variant"]).toBe("tabular-nums, lining-nums");
  });
});

describe("the -rn-* declarations, once React Native has them", () => {
  it("arrive as style props, with fontVariant as the list it has to be", async () => {
    setupAllComponents();
    registerCSS(compiled.android, { inlineRem: 16 });
    await render(<View testID="probe" className="font-numeric tabular-nums shadow-carrot" />);
    const style = screen.getByTestId("probe").props.style;
    expect(style).toMatchObject({
      includeFontPadding: false,
      fontVariant: ["tabular-nums", "lining-nums"],
      elevation: 3,
    });
    // The empty `font-family` above reaches React Native as nothing at all,
    // which is the whole point of it.
    expect(style).not.toHaveProperty("fontFamily");
  });
});
