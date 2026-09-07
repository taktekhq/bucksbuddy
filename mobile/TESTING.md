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
- **`crypto.ts` is slow under jest** (600k PBKDF2 rounds, and the native
  derivation in `lib/pbkdf2` only exists in a real build). Test the wrap/unwrap
  round trip once, and use `jest.setTimeout` if a suite needs it; test the
  cheap paths (base64, value encryption, the verifier) directly.

## What "100%" covers

Everything under `src/` except `App.tsx` (bootstrap), `src/types` (types only)
and `src/test` (the harness) — the same exclusions the web makes.
