# Taking BucksBuddy native (Expo) — plan & validation strategy

> Status: **proposal**. Nothing here is implemented yet. The point of writing it
> down first is that the *sequence* matters more than any individual step: done
> in the right order, every stage is guarded by tests that already exist. Done
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
(see Validators #3). Do this against `main` so the fixtures capture today's
behaviour, not the behaviour of a half-migrated core.

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

### 3. Golden fixtures (characterization tests)

Before any code moves, generate a synthetic corpus — a few hundred transactions
spanning multiple months, both directions, USD and LBP at several rates, safe
transfers, gold entries, subcategories, and the nasty edges (month boundaries,
DST, LBP rounding, empty months, a single-entry month). Run every core function
over it and freeze the outputs as JSON.

Then any port that changes a number fails loudly. Cheap to build, and it covers
the combinations hand-written tests never think of.

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

### 9. Mutation testing

100% coverage proves every line *ran*. It does not prove any assertion would
notice if the line were wrong — and this is a money app, where "the test executed
`netCents` and asserted nothing useful" is exactly the failure we can't afford.
Mutation testing closes that gap: flip `+` to `-`, `>` to `>=`, drop a branch,
and see whether the suite screams.

**Stryker** (`@stryker-mutator/core` + `vitest-runner` + `typescript-checker`),
targeted at `packages/core`. Not the UI — mutating JSX produces mostly-equivalent
mutants and enormous runtimes for very little signal. The money math is where
this pays.

Sequencing matters: **baseline the mutation score on `main` before the core
extraction**, so we can prove the port didn't weaken the suite. A refactor that
holds 100% coverage while quietly dropping the mutation score is exactly the kind
of silent regression this migration needs to catch.

Set the threshold at whatever the baseline turns out to be, then ratchet upward.
Don't pick a number in advance and then argue with reality.

### 10. CI shape

| Job | Trigger |
|---|---|
| `apps/web` build + 100% coverage (existing, untouched) | every push |
| `packages/core` on Node — 100% coverage | every push |
| `packages/core` on Hermes | every push |
| crypto vectors, three-way | every push |
| `apps/mobile` jest-expo — 100% coverage | every push |
| Stryker mutation run on `packages/core` | nightly + `mutation` label |
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
| **Mutation testing** | Yes — Stryker on `packages/core`, baselined on `main` before the port. |
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
