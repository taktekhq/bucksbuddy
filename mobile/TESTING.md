# Testing the mobile app

`npm test` (jest) · `npm run coverage` (adds the 100% gate)

The harness mirrors the web's: colocated `*.test.ts(x)` beside the source and a
hard 100% threshold (see `jest.config.js` / `../vitest.config.ts`).

## Reuse the web's tests

Most of `src/lib` is a byte-identical copy of `../src/lib`, so the web's test
file is the right starting point — copy it and adapt. Where it passes
unchanged, that is evidence the ported logic behaves the same, which is the
point. Four mechanical differences between vitest and jest:

| Web (vitest) | Mobile (jest) |
| --- | --- |
| `import { describe, it, expect } from "vitest"` | delete it — jest has them as globals |
| `vi.fn()` / `vi.mock()` | `jest.fn()` / `jest.mock()` |
| `vi.stubGlobal("fetch", x)` | assign `global.fetch` directly and restore in `afterEach` |
| any variable used inside a `jest.mock()` factory | must be named `mockSomething` — jest refuses other out-of-scope names |

## Traps specific to this setup

- **`render` is async in RNTL 14.** `await render(<X />)`, then query through
  the imported `screen`. Destructuring the return value silently gives you a
  Promise and every query is `undefined`.
- **Native modules are faked in `src/test/setup.ts`** — the keystore
  (`expo-secure-store`), AsyncStorage, analytics, Reanimated, and the expo
  modules used for side effects. Both fakes are plain `Map`s exported as
  `mockSecureStore` / `mockAsyncStorage`; they're cleared between tests.
- **`lucide-react-native`** resolves to its CommonJS build in tests, because
  the `react-native` export condition points at an `.mjs` bundle that jest's
  default transform ignores. Nothing to do — just don't be surprised.
- **Supabase** is not mocked globally. Mock `@/lib/supabase` per test file with
  whatever shape that file needs, as the web's tests do.
- **Classes are inert under jest** — NativeWind skips its component registry when
  `NODE_ENV === "test"`, so `className` stays a string prop and most assertions
  are on that string. When the question is what a class *means*, use
  `src/test/tailwind`: it compiles the real config and hands back the style
  objects the device will lay out. `Screen.styles.test.tsx` is the example, and
  it is the only kind of test that can see a layout rule being broken.
- **jest runs no layout at all**, so nothing here can catch a page that scrolls
  past its own content. `useScrollBoundsReport` covers that gap from the other
  side: the app reports itself, with numbers, when a scroller goes out of bounds.
- **jest is not the device.** Tests run on node, which provides globals Hermes
  does not (`crypto` above all). A green suite is not evidence that something
  exists at runtime — see PORTING.md §5. When code depends on a global, test it
  with that global deleted; `crypto.test.ts` does exactly that.
- **jest-expo's `expo-crypto` mock returns all zeros.** Anything that needs real
  randomness has to stand something else in, or it will pass while proving
  nothing. `installCsprng` refuses a source like that on purpose.
- **`crypto.ts` is slow under jest** (600k PBKDF2 rounds, and the native
  derivation in `lib/pbkdf2` only exists in a real build). Test the wrap/unwrap
  round trip once, and use `jest.setTimeout` if a suite needs it; test the
  cheap paths (base64, value encryption, the verifier) directly.

## What "100%" covers

Everything under `src/` except `App.tsx` (bootstrap), `src/types` (types only)
and `src/test` (the harness) — the same exclusions the web makes.
