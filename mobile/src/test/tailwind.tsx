// Compile the app's real Tailwind config and hand the result to NativeWind, so
// a test can assert the style objects a class list actually produces.
//
// WHY THIS EXISTS
//
// Under jest, NativeWind deliberately does not register its components:
// react-native-css-interop/dist/runtime/wrap-jsx.js guards the registration
// with `if (process.env.NODE_ENV !== "test")`. Every class name therefore stays
// an inert string prop, which is why the rest of the suite asserts on className
// text. That is fine for "did the right classes get through", and useless for
// "what did they mean" — and layout bugs live in the second question.
//
// Two of them have now shipped. `min-h-full` was carried into a scroll
// container by three screens and by nothing else; the class had no business
// being there and no test could see it. Reaching for the compiler is the only
// way a test gets to look at the numbers the device will lay out.
//
// Cost: roughly a second per distinct class list, so the results are cached and
// this belongs in its own file — `setupAllComponents` is a module-scope side
// effect that changes what every other assertion in the same file sees.
import { View } from "react-native";
import { render, screen } from "@testing-library/react-native";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { registerCSS, setupAllComponents } from "react-native-css-interop/dist/test";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require("../../tailwind.config.js");

const cache = new Map<string, string>();

async function compile(classNames: string): Promise<string> {
  const cached = cache.get(classNames);
  if (cached !== undefined) return cached;
  const { css } = await postcss([
    tailwind({
      ...config,
      // Only the classes asked for, so the compile stays fast and the assertion
      // is about them rather than about everything the app happens to use.
      content: [{ raw: `<div class="${classNames}"/>`, extension: "html" }],
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  cache.set(classNames, css);
  return css;
}

/**
 * Turn NativeWind on for this file and teach it the given classes.
 *
 * `inlineRem: 16` mirrors metro.config.js — NativeWind's own default is 14, and
 * getting that wrong is what once made the whole app look zoomed out.
 */
export async function useTailwind(classNames: string): Promise<void> {
  setupAllComponents();
  registerCSS(await compile(classNames), { inlineRem: 16 });
}

/** The resolved style object for one class list, as the device would see it. */
export async function stylesFor(classNames: string): Promise<Record<string, unknown>> {
  await useTailwind(classNames);
  await render(<View testID="probe" className={classNames} />);
  return (screen.getByTestId("probe").props.style ?? {}) as Record<string, unknown>;
}
