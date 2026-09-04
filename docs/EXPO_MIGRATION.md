# Taking BucksBuddy native (Expo) — plan & validation strategy

> Status: **in progress**. The SDK 57 development-client shell, native Supabase
> session persistence, and the encrypted transaction-list parity probe are in
> `apps/mobile`. Crypto is now the first extracted shared-core module and the
> native vector/benchmark screen is wired; amounts stay obscured until that
> gate passes on real devices. The point
> of writing the sequence down is that it matters more than any individual
> step: done in the right order, every stage is guarded by tests that already
> exist. Done
> as a big-bang rewrite, we throw away the only oracle we have.

## Why we're doing this

**Scope right now: the Expo port and nothing else.** Get BucksBuddy running as a
real native app on iOS and Android, at behavioural parity with the web app.

The longer-term motivation is shipping a small LLM on-device, so the app can
talk about your money without your money leaving the phone — impossible in a
browser tab. That's deliberately **not** in this plan. But it's why we're going
native rather than polishing the PWA, and it's why we build on a **custom dev
client with native modules available** rather than constraining ourselves to
what a sandbox runtime allows. The architecture below keeps that door open
without paying for it now.

The nearer-term wins are real too: Face ID on the encryption vault, notifications,
the App Store, proper gestures.

### Expo Go: considered, rejected

Worth recording since it came up. With the LLM deferred, Expo Go was genuinely
viable — the only native module we'd need is crypto, and `@noble/ciphers` +
`@noble/hashes` cover AES-GCM and PBKDF2 in pure JS. Measured on V8: noble's
AES-GCM output is **byte-identical to WebCrypto**, and PBKDF2 at 600k iterations
costs 734 ms pure-JS vs 106 ms native (6.9x).

We're not taking it, because:

- Hermes is meaningfully slower than V8 on tight numeric loops, so that 734 ms is
  realistically 3-4 s on a good phone and worse on low-end Android — and
  `loadVault` runs PBKDF2 on **every cold start** for default-tier users, not
  just on unlock. That's a multi-second launch freeze for every user.
- Expo Go is a development convenience, not a distribution channel. We need EAS
  builds and store accounts to reach users regardless, so it only ever saved us
  dev-loop time, not release work.
- Designing around "no native modules" would be a constraint we'd have to undo
  the moment the LLM lands.

So: **custom dev client from day one.** Contributors need an EAS build; that's
accepted cost.

The noble finding isn't wasted, though — see Validator #4, where it earns its
keep as an independent third implementation.

## What we're starting from

| | |
|---|---|
| Source | ~6,400 LOC TypeScript |
| Tests | ~5,250 LOC, **100% coverage enforced in CI** |
| Split | ~2,300 LOC pure logic in `src/lib`, ~4,100 LOC React UI |
| Platform coupling | 11 `localStorage` sites, 15 `window.*`, 8 `document.*`, 7 `crypto.subtle` |
| Styling | 444 Tailwind `className` usages |

That last table is the good news. The app is already almost cleanly separated:
`src/lib/{money,stats,dates,csv,categories,history,gold,publicStats,currency}` is
platform-free arithmetic, and its only ties to the browser are `localStorage`,
`crypto.subtle` and `window`. **Just three seams.** That's what makes this a port
rather than a rewrite.

## The core idea

**Don't rewrite. Split the app into a core and two shells, and keep the existing
web app alive as the reference implementation.**

```
packages/core/      pure TS: money math, stats, dates, csv, categories,
                    crypto, e2e vault, store logic. No DOM, no RN.
                    Talks to the outside through injected ports.
apps/web/           the existing Vite PWA. Frozen during the migration.
                    It is the oracle we validate against.
apps/mobile/        the new Expo app. iOS + Android.
```

The core reaches the platform through two tiny injected interfaces instead of
touching globals:

```ts
interface StoragePort { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void }
interface CryptoPort  { getRandomValues(a: Uint8Array): Uint8Array; subtle: SubtleCryptoLike }
```

Web supplies `localStorage` + `window.crypto`. Native supplies
`AsyncStorage`/`SecureStore` + `react-native-quick-crypto`. Everything else in
the core stops caring what it's running on.

## Phases

### Phase 0 — Extract the core (still 100% on web)

**No Expo yet.** Convert the repo to a workspace, move `src/lib/*` into
`packages/core`, and replace the three seams with ports. The existing 5,250 LOC
suite must stay green at 100% the whole way through, and nothing user-visible
changes.

This is the highest-value step in the plan and it's fully guarded by tests we
already have. If it goes badly we've learned that cheaply, on web, with an
instant rollback. Everything after it gets easier.

Also in Phase 0, before any code moves: **build the golden-fixture corpus**
(see Validators #3 — done, against `main`, so the fixtures capture today's
behaviour rather than a half-migrated core's).

*Rough size: 2–3 days.*

### Phase 1 — Expo skeleton that can read real data

Expo SDK with `expo-router`, NativeWind for the Tailwind classes, and a
**custom dev client** (see the Expo Go note above). Budget for that: EAS builds,
an Apple Developer account, a Play console.

The work here is auth and crypto, not screens:

- Supabase client for RN: storage adapter over SecureStore/AsyncStorage,
  `detectSessionInUrl: false`, OAuth through `expo-auth-session` +
  `expo-web-browser` with a deep-link scheme, and a deep-link path for the
  password-recovery flow that `useSession` currently parses out of the URL hash.
- `CryptoPort` backed by `react-native-quick-crypto` (JSI; it supports
  `subtle.importKey`/`deriveBits` for PBKDF2 and AES-GCM encrypt/decrypt, which
  is exactly the surface `lib/crypto.ts` uses). Native speed means the cold-start
  PBKDF2 stays in web territory (~100 ms) rather than seconds.

**Do the PBKDF2 benchmark on a real low-end Android in this phase**, before any
screens exist. It's twenty minutes of work and it either confirms the choice or
tells us to cache the unwrapped master key in `expo-secure-store` (which would
also be a security upgrade — web currently caches the passphrase itself in
`localStorage` in the clear).

Exit gate for this phase is one screen — a plain list of transactions —
plus the crypto vectors from Validators #4 passing on a real device. Boring on
purpose. If cross-platform decryption doesn't work, we need to know in week two,
not week eight.

*Rough size: 3–5 days, most of it auth and native build setup.*

#### Implemented so far

- Expo SDK 57 + Expo Router under `apps/mobile`.
- Custom development-client and EAS development/simulator profiles.
- iOS and Android application identifiers plus the `bucksbuddy://` deep-link
  scheme.
- Supabase auth persistence over AsyncStorage with URL session detection off.
- Email/password sign-in and a real, refreshable transaction metadata query.
- A deliberate encrypted-value mask. The mobile shell does not attempt to
  interpret ciphertext before Validator #4 is wired to native crypto.
- A shared `@bucksbuddy/core/crypto` implementation with an injected provider,
  used by both Vite/WebCrypto and Expo/react-native-quick-crypto.
- A native `/crypto-check` route that opens the frozen default/passphrase
  browser envelopes, validates the verifier and native round-trip, and measures
  PBKDF2 at 600,000 iterations.
- The noble referee from Validator #4: `packages/core/src/crypto-noble.ts`
  reimplements the envelope format in pure JS (`@noble/ciphers` +
  `@noble/hashes`), and a three-way vector test asserts it agrees with
  WebCrypto on the frozen envelopes and on fresh round trips in both
  directions. Runs on every push, alongside WebCrypto's own suite.
- Coverage fixed to actually gate `packages/core`: extracting `crypto.ts` had
  quietly dropped it out of `vitest.config.ts`'s coverage `include` (scoped to
  `src/**`), so it stopped being measured by the 100% gate and was only
  still watched by nightly mutation testing. Now included explicitly.
- Google OAuth and password-recovery deep linking, mirroring web's flows
  (`src/screens/Landing.tsx`, `src/screens/Reset.tsx`) on the same
  `bucksbuddy://` scheme: `oauth.ts` opens Google's authorize URL via
  `expo-web-browser`'s `openAuthSessionAsync` (Supabase's own
  `signInWithOAuth` browser redirect is web-only) and hands the returned
  `bucksbuddy://auth-callback#access_token=...` fragment to `setSession`;
  `useSession.ts` listens for the same fragment shape arriving as a cold- or
  warm-start deep link at `bucksbuddy://reset#...&type=recovery` and flips
  `recoveryMode`, which locks the app on `ResetScreen` exactly like web's
  `App.tsx` does for `Reset`. **Needs a one-time Supabase dashboard change**
  before it can work on a real build: add `bucksbuddy://auth-callback` and
  `bucksbuddy://reset` to Auth > URL Configuration > Redirect URLs.

The remaining Phase 1 work is executing and recording the crypto-check gate,
and the OAuth/recovery flows above, on real iOS and low-end Android hardware —
all of it is currently unverified beyond typecheck, since it's blocked on
tooling, not code: this Mac's Xcode 26.3 (Swift 6.2.4) hits a known Expo SDK 57
/ `expo-modules-jsi` Swift-C++ interop compile failure
([expo/expo#46242](https://github.com/expo/expo/issues/46242)); Expo's
maintainers say SDK 56/57 need Xcode 26.4+ (Swift 6.3).

**Resolution for iOS: upgrade the local Xcode, not a CI workaround.** A CI job
that only builds for the Simulator can't install anything on a physical
iPhone anyway, and the crypto-check gate specifically needs to run on real
hardware — so a macOS runner was solving the wrong problem there. Upgrading
Xcode locally to 26.4+ and running `expo run:ios --device` directly is the
simpler, more direct path to actually getting a build onto the phone. (A
`mobile-ios-build` CI job was built and then removed once this became clear —
worth knowing if it turns up in old branches.)

**Resolution for Android: CI, for real this time.** Unlike iOS, nothing about
Android needs Apple's toolchain or a physical device to get a first
correctness signal — a plain `ubuntu-latest` runner has KVM for the emulator,
no macOS-runner cost or version uncertainty. The `mobile-android-crypto-check`
job (`.github/workflows/ci.yml`) builds a debug APK, boots an emulator,
deep-links straight into `/crypto-check` — which auto-runs on mount and logs a
greppable `CRYPTO_CHECK_RESULT=PASS|FAIL` line — and asserts the result from
`adb logcat`. This is the piece Validator #4's automated suite structurally
can't reach on its own: `crypto-vectors.test.ts` only ever runs WebCrypto
against the pure-JS noble referee, both in Node, since `react-native-quick-crypto`
is a native module that needs a real RN runtime. This job is where that third
leg actually gets exercised.

Still unverified end-to-end by whoever wrote it — no KVM and no route to
`dl.google.com` (blocked by this session's egress policy) in the sandbox that
authored it, so, like the iOS job before it, it's reasoned from a
well-documented, widely-used GitHub Action rather than dry-run. Runs by
default on every push/PR rather than gated behind a label, since ubuntu
runners are cheap — but note it only fires on `pull_request` events or
`workflow_dispatch`; the workflow's `push` trigger is scoped to `main`, so a
direct push to a feature branch with no open PR won't trigger it on its own.

**Update: run for real, bug found and fixed.** The job did hit exactly the
kind of thing an unverified action invites: `android-emulator-runner` executes
its `script` via `/bin/sh` (dash on `ubuntu-latest`), which has no `pipefail`
option, so `set -euo pipefail` failed immediately with "Illegal option" before
the emulator was ever touched. Nothing in the script depends on a pipe's exit
status, so `set -eu` fixes it with no behavior change. The job now also writes
`apps/mobile/.env` from `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`
secrets before prebuild, matching local dev, even though `/crypto-check` itself
never touches Supabase — the rest of the bundled JS does, and a fully-configured
build is one less variable versus a stubbed one.

iOS's exit gate also finally ran for real, once the local Xcode upgrade
happened after all (26 wasn't enough — see the sidebar below): both the
crypto-check vectors and Google sign-in passed on physical hardware. Getting
there needed one more unplanned fix, on top of everything above — see the
iOS 27 sidebar.

#### Sidebar: iOS 27's UIScene requirement broke the freshly-built dev client

Xcode 27 (paired with iOS 27) turned a long-standing deprecation warning into
a hard launch-time trap: apps built against the iOS 27 SDK now crash
immediately (`EXC_BREAKPOINT` / `SIGTRAP`, inside
`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`) unless they
declare `UIApplicationSceneManifest` in Info.plist and adopt the UIKit scene
life cycle. Expo's SDK 57 template doesn't yet — `AppDelegate.swift` still
creates the `UIWindow` directly in `application(_:didFinishLaunchingWithOptions:)`,
the legacy pattern. Already filed upstream
([expo/expo#46663](https://github.com/expo/expo/issues/46663),
[#46664](https://github.com/expo/expo/issues/46664)) and fixed on Expo's
`main` branch ([expo/expo#46733](https://github.com/expo/expo/pull/46733)) —
adding `ExpoAppSceneDelegate.swift` and `ExpoReactNativeFactoryProvider.swift`
to the `expo` package — but not yet in a published release as of SDK 57.0.20.

Stopgap applied locally: those two files vendored into
`node_modules/expo/ios/AppDelegates/` (picked up automatically by the `Expo`
podspec's `ios/**/*.swift` glob — needs a `pod install` to be discovered,
which needs CocoaPods installed at all: this Mac's fresh Xcode 27 reinstall
had none, `brew install cocoapods` was the fix), plus `AppDelegate.swift`
conforming to `ExpoReactNativeFactoryProvider` instead of creating the window
itself, plus the `UIApplicationSceneManifest` key in `Info.plist` pointing at
`EXExpoAppSceneDelegate`. **Not yet committed** — it lives only in the
git-ignored `apps/mobile/ios/` and in `node_modules`, so it needs to be made
durable (committed generated-file edit, or better, an Expo config plugin so
it survives a future `expo prebuild --clean`) before this is safe to rely on
from a fresh clone or CI. Drop the whole stopgap once `expo` publishes a SDK
57.x release containing #46733.

A second, unrelated snag on the same run: a stale `ios/.xcode.env.local`
(git-ignored, machine-local) pointed `NODE_BINARY` at an old system Node
(v19.4.0) that predates `util.parseEnv`, which `@expo/env` now calls — fixed
by pointing it at the project's actual Node (v22.23.2, per `.nvmrc`).

### Phase 2 — Port the screens

Order by risk, riskiest first, so surprises land while there's still schedule:

`Home` → `AddComposer` → `History` → `Safe` → `Stats` → `Settings`

The mechanical substitutions:

| Web | Native |
|---|---|
| Tailwind `className` | NativeWind (most classes survive verbatim) |
| `lucide-react` | `lucide-react-native` (same icon names) |
| `framer-motion` (4 files) | `moti` / `react-native-reanimated` |
| `window.confirm` (Home, History, Safe) | `Alert.alert` — **note this turns sync into callback-async** |
| CSV `<a download>` in Settings | `expo-file-system` + `expo-sharing` |
| `useThemeColor` (`<meta>` tag) | `expo-status-bar` / `expo-system-ui` |
| hash router | `expo-router` file routes |
| `posthog-js` | `posthog-react-native` |

**Don't port `Landing`, `Legal`, `Contact`, or the public `/stats` variant.**
Those are marketing and SEO surfaces; they belong on the web and should stay
there. That's ~420 LOC we simply don't move.

*Rough size: 2–3 weeks.*

### Phase 3 — Earn the native install

Only the things that are genuinely better native. The obvious first one is a
real security upgrade rather than a gimmick: today the E2E passphrase is cached
in `localStorage`, which is readable by anything with a debugger. On device it
moves into the Keychain/Keystore behind `expo-local-authentication` — Face ID to
unlock your amounts. That's a straight improvement on the current design.

Then: notifications, share-sheet capture, maybe a widget.

*Rough size: ~1 week for the biometric vault, the rest optional.*

### Phase 4 — Decide the web's fate

Deferred deliberately. **You've chosen to keep the web app, frozen**, which is
the right call for the migration: it can't be the oracle if we're also rewriting
it. The open question is only what happens *after* native ships — keep the Vite
PWA on the shared core (two UIs, one brain, which the marketing pages want
anyway), or collapse it onto Expo web via react-native-web. Not a decision for
now.

### Out of scope: the LLM

Explicitly deferred. Recording the two constraints that must survive into
whatever we build now, so we don't have to undo anything later:

- **Delivery**: weights get downloaded on first launch, never bundled. Keeps
  install size sane and model updates out of App Store review.
- **The hard rule**: the model never does arithmetic. It reads and it phrases;
  every number it says comes from a `packages/core` call. This is a money app —
  an LLM that hallucinates a balance is worse than no feature. It also means the
  feature inherits the 100%-covered, mutation-tested core as its source of truth.

Neither constrains the port. Both are why we're on a dev client.

---

## Validators: proving nothing broke

This is the part that actually determines whether the migration is safe. Ten
things, roughly in order of value per unit of effort.

### 1. Freeze the web app as the oracle

Tag `web-parity-baseline` at the last pre-migration commit. `apps/web` keeps
building and keeps running its full suite in CI, unchanged, for the whole
migration. Every "did this change behaviour?" question has a runnable answer.

### 2. Run the same core suite on both JS engines

The core tests execute twice: under Vitest on Node/V8, and under `jest-expo` on
Hermes on a real simulator. Same test files, two runtimes.

This is the single most valuable validator, because the failure mode it catches
is invisible otherwise. There are **12 `Intl` / `toLocaleDateString` call sites**
in the app (`money.ts`, `gold.ts`, `dates.ts`, `stats.ts`, three screens). ICU
versions differ between V8 and Hermes, and they disagree on things like whether
`$1,234.00` uses U+00A0 or U+202F as a separator. That kind of difference passes
code review, passes a smoke test, and then breaks a string assertion — or worse,
silently changes what the user reads — six weeks later.

### 3. Golden fixtures (characterization tests) — done

`src/lib/__fixtures__/corpus.ts` generates a deterministic 314-transaction /
31-gold-entry corpus (seeded PRNG, no `Math.random`) spanning all twelve
months of 2026, both directions, USD and LBP at five rates, Safe transfers in
both directions, real parent/sub category pairings (including two ids —
`family`, `other` — that exist in both the income and expense lists), and a
run of deliberately hand-placed edges: entries sitting on the exact
millisecond a month opens and closes, the 2026 US DST spring-forward and
fall-back instants, a month with zero transactions, a month with exactly one
(pinned as a spend, not left to the PRNG — an income-only single entry would
never exercise the n=1 forecast division it exists to test), and rows where
`is_income` disagrees with what the category name would suggest, which
`isSpending` must not care about.

`golden.test.ts` runs every pure function in `src/lib` over that corpus from
eight named reference dates and freezes the results to a checked-in
`golden.json` (`UPDATE_GOLDEN=1 npx vitest run .../golden.test.ts` to
regenerate after a deliberate behaviour change — read the diff the way you'd
read a schema migration, since every changed number is a claim the old one
was wrong). It runs as part of the existing `npm run coverage`/CI job; no
separate CI entry was needed.

One finding worth carrying forward: the corpus bakes in *absolute* local
calendar dates (`new Date(2026, 2, 8, 2, 30)`, deliberately — the DST and
month-boundary edges only exist as absolute instants), which makes the frozen
`golden.json` timezone-dependent in a way the rest of the suite isn't — the
existing tests are written to use dates relative to a fixture `now`, so they
pass identically in any timezone. Pinned `TZ: "UTC"` in `vitest.config.ts`
(matching the CI runner's default) rather than leave it to whatever machine
happens to run the tests.

### 4. Cross-platform crypto vectors — non-negotiable

**The highest-severity risk in the whole migration is silent data corruption at
the encryption boundary.** If native writes `_enc` columns the web can't read,
users lose data and we find out from a support message.

So: freeze a set of vectors — wrapped keys at both tiers, encrypted amounts,
notes, gold grams — generated by the current web build. Both runtimes must
decrypt all of them, and ciphertext written by either must round-trip through
the other. This runs in CI on every commit that touches crypto.

**Three implementations, not two.** `@noble/ciphers` is pure JS and runs
anywhere, and it has been measured byte-identical to WebCrypto's AES-GCM
output. So the vector suite asserts agreement between *three* independent
implementations — WebCrypto (web), `react-native-quick-crypto` (native), and
noble (the referee that runs in both). When two disagree, the third says which
one is wrong. Noble costs us one devDependency and no shipped bytes.

Two things to measure early while we're in there:

- **PBKDF2 at 600,000 iterations on a low-end Android.** Native crypto should
  keep this ~100 ms, but confirm it — `loadVault` runs it on every cold start,
  not just on unlock, so a regression here is a launch-time freeze for every
  user. The envelope is already version-tagged (`v1.<salt>.<iv>.<ct>`), so the
  parameters *can* change without a data migration — but changing them splits
  compatibility across devices, so measure before deciding, not after.
- That `react-native-quick-crypto`'s AES-GCM output is byte-identical to
  WebCrypto's, not merely "also valid AES-GCM."

### 5. Screen tests ported, not rewritten

For each screen, port its React Testing Library test to
`@testing-library/react-native`, **keeping the test names and assertions the
same** wherever the query maps over (`getByText` → `getByText`). The two test
files then diff cleanly against each other, and the diff is the checklist of
what we consciously changed. Parity here is behavioural, not pixel — we're
asking "does tapping Out then Groceries then 12 save an expense of $12", not
"is this shadow 2px."

### 6. Maestro E2E on real simulators

One flow file per critical path, run against a seeded Supabase project:
sign in → add In → add Out in LBP → edit → delete → switch month → export CSV →
enable passphrase → kill the app → unlock. Maestro over Detox for the
maintenance cost; these run on a nightly/label trigger, not every push.

### 7. The live diff harness

The one that actually answers "is it working as before." Point the frozen web
app and the Expo app at the **same seeded account**, then assert the headline
numbers match: running balance, month net, per-category totals, safe cash, safe
gold, and the CSV export byte-for-byte. Script it so it's one command.

If those agree across two implementations reading one database, the port is
correct in the way users care about.

### 8. Coverage stays at 100% — everywhere

**Settled: 100%, core and mobile shell alike.** No relaxation.

I'd flagged this as worth relaxing for the native UI; the call is to hold the
line, so the plan absorbs the cost rather than arguing with it. What that means
concretely, so it doesn't ambush us in Phase 2:

- Native module mocks have to be real work, not stubs — `expo-secure-store`,
  `expo-file-system`, `expo-local-authentication`, `Alert`. Budget for a proper
  `apps/mobile/test/mocks` layer early in Phase 1, before there are screens
  fighting us.
- Gesture and animation branches (`SwipeToDelete`, the Reanimated paths) are the
  expensive ones. `@testing-library/react-native` can drive gesture handlers, but
  the tests are fiddly. Port `SwipeToDelete` early as the canary — if 100% is
  going to hurt anywhere, it hurts there, and better to learn it in week two.
- `/* c8 ignore */` on genuinely unreachable native branches is acceptable and
  should be commented with *why*. An honest 100% with three justified ignores
  beats a dishonest 92%.

### 9. Mutation testing — done, at 100%

100% coverage proves every line *ran*. It does not prove any assertion would
notice the line being wrong — and this is a money app, where "the test executed
`netCents` and asserted nothing useful" is exactly the failure we can't afford.

**Stryker is now in place across the thirteen pure-core modules and scores
100%**, enforced by a break threshold and run nightly (plus on demand, and on
any PR labelled `mutation`). The starting score was 74.95%. Coverage was 100%
before and after — none of the tests written to get there added a covered line,
which is the whole point.

Three things worth carrying into the port:

- **The gaps were fixture coincidences, not untested paths.** Assertions that
  passed for the wrong reason: a `coffeeCount: 4` that held under an inverted
  condition because the fixture happened to be half coffee; a forecast that
  couldn't tell June's 30 days from April's; month-edge behaviour never probed
  because every fixture sat at noon. None of these are visible in review.
- **`crypto`'s gaps were all stored-format contracts** — the version tag, the
  default passphrase, the verifier plaintext. Round-trip tests structurally
  cannot catch them, because they re-encrypt with whatever the constant
  currently says. Golden envelopes are now checked in as data, and they are the
  first of the web/native vectors Validator #4 needs.
- **The Supabase mock discarded every builder argument**, so tests could see
  *that* an update happened but not that it wrote the right column or filtered
  on the right user. It now records them. This matters directly for the port:
  the native store issues these same queries.

**Do not point Stryker at data.** `categories.ts` is 288 lines that are mostly a
static table of 67 category definitions, and it alone produced 211 of the
original 256 survivors — all `StringLiteral`/`ObjectLiteral` mutants on labels
and colours. Killing those would mean duplicating the table in a test file: a
change-detector that protects against no defect and doubles the cost of adding
a category. The file is mutated from line 239, where the table ends and the
lookup logic begins. That exclusion is also what makes it affordable — the run
went from **41 minutes to about 5**.

Twenty-three mutants are genuinely equivalent and suppressed **individually with
reasons**, never blanket-disabled. A 100% score is only as honest as those
comments, so each was checked rather than argued — several differentially,
running mutated against original over a randomized corpus. The recurring
categories: module-level `Intl` constants Stryker can never activate (it flips
mutants per-test, but modules evaluate once at import); comparisons that
coincide at zero; and guards made redundant by a surrounding `try/catch` that
returns the same value.

When Phase 0 extracts `packages/core`, `store.tsx`'s logic becomes pure and
should join the mutated set. React glue — `router`, the hooks — should not:
mutating JSX yields mostly-equivalent mutants and long runtimes for little
signal.

### 10. CI shape

| Job | Trigger |
|---|---|
| `apps/web` build + 100% coverage (existing, untouched) | every push |
| `packages/core` on Node — 100% coverage | every push |
| `packages/core` on Hermes | every push |
| crypto vectors, three-way | every push |
| `apps/mobile` jest-expo — 100% coverage | every push |
| Stryker mutation run on `packages/core` (100% gate) | nightly + `mutation` label + dispatch |
| EAS build + Maestro | nightly + `e2e` label |

Mutation runs are minutes, not seconds, so they don't belong on every push. But
they must be non-optional on a schedule, or the score quietly rots.

---

## Risks

**Technical**

- Cross-platform `_enc` compatibility — highest severity, mitigated by #4.
- Hermes `Intl` divergence across 12 call sites — mitigated by #2 and #3.
- PBKDF2 600k on low-end hardware — measure in Phase 1, on device.
- Holding 100% through gesture and native-module branches — mitigated by
  building the mock layer first and porting `SwipeToDelete` as the canary.
- `window.confirm` → `Alert.alert` turns three delete flows from sync to
  callback-async. Small, but it's a real behaviour change in a destructive path.

**Process / cost**

- Every contributor needs an EAS dev build. Accepted.
- Apple Developer ($99/yr) + Play Console ($25 one-off), plus App Store review
  latency on a finance app.

## Decisions (settled)

| | |
|---|---|
| **Coverage** | Stays at **100%**, core and mobile shell alike. No relaxation. |
| **Mutation testing** | Yes — Stryker on the pure core, **at 100%** and gated. Done before the port, so the port has a baseline to preserve. |
| **The web app** | **Kept and frozen.** Serves as the parity oracle during the migration; its long-term fate is a Phase 4 question. |
| **Platform order** | **iOS first, then Android** — but see below. |
| **On-device LLM** | Out of scope for now. Architecture keeps the door open. |
| **Expo Go** | Not used. Custom dev client from day one. |

### A note on "iOS first"

You're right that it's a strange question for an Expo app, and the answer is that
it barely matters: one codebase, one Metro bundle, `eas build --platform all`.
There's no meaningful "port to Android" step after iOS.

Where the order *does* matter is narrower than it sounds:

- **Store submission.** Two review queues, two sets of metadata and screenshots,
  two rejection risks. Serialising them means the first rejection doesn't stall
  both.
- **Device QA.** Real divergence lives in safe-area insets, keyboard avoidance,
  the back button, date/`Intl` formatting under Android's Hermes ICU, and the
  Keychain-vs-Keystore behaviour of `expo-secure-store`. That's a QA pass, not a
  development phase.

Since you have users on both, the practical shape is: **develop both from day
one** (CI builds and tests both throughout — Android bugs found in week two are
cheap, in week ten they're not), **submit iOS first.** Android trails by a
release, not by a phase. The "iPhone-first" framing in the design system is about
layout priorities, not about Android being second-class.
