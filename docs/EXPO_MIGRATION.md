# Taking BucksBuddy native (Expo) — plan & validation strategy

> Status: **proposal**. Nothing here is implemented yet. The point of writing it
> down first is that the *sequence* matters more than any individual step: done
> in the right order, every stage is guarded by tests that already exist. Done
> as a big-bang rewrite, we throw away the only oracle we have.

## Why we're doing this

The goal isn't "be an app instead of a PWA." The goal is **shipping a small LLM
on-device** so the app can talk about your money without your money leaving the
phone. That's not possible in a browser tab, and it's the one requirement that
should drive every technical decision below — it rules out Expo Go, it sets a
RAM/storage budget, and it decides how the app is distributed.

The nice side effects (Face ID, notifications, the App Store, real gestures) are
real, but they're not the reason. Keep that straight when the plan gets long.

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
**custom dev client** — Expo Go is out from day one, because both
`react-native-quick-crypto` and the on-device LLM runtime need native modules.
Budget for that: EAS builds, an Apple Developer account, a Play console.

The work here is auth and crypto, not screens:

- Supabase client for RN: storage adapter over SecureStore/AsyncStorage,
  `detectSessionInUrl: false`, OAuth through `expo-auth-session` +
  `expo-web-browser` with a deep-link scheme, and a deep-link path for the
  password-recovery flow that `useSession` currently parses out of the URL hash.
- `CryptoPort` backed by `react-native-quick-crypto` (JSI; it supports
  `subtle.importKey`/`deriveBits` for PBKDF2 and AES-GCM encrypt/decrypt, which
  is exactly the surface `lib/crypto.ts` uses).

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

### Phase 4 — The LLM

This is its own project and it starts only once parity is signed off. The
decisions that matter:

- **Runtime.** `react-native-executorch` (Software Mansion, Meta's ExecuTorch
  underneath) is the well-supported Expo-friendly option; `llama.rn` /
  llama.cpp+GGUF is the alternative with the bigger community. Prototype both
  behind one interface before committing.
- **Delivery.** Download the weights on first launch, don't bundle them. A
  bundled multi-GB model wrecks the install size, and most users won't turn the
  feature on. Bundling also drags model updates through App Store review.
- **The hard rule: the model never does arithmetic.** It reads and it phrases;
  every number it says comes from a `packages/core` function call. This is a
  money app — an LLM that hallucinates a balance is worse than no feature. It
  also means the LLM feature inherits the 100%-covered core as its source of
  truth, and we can test it by asserting *which tool it called*, not by grading
  its prose.
- Budget for RAM ceilings on low-end Android, and for App Store review of a
  finance app that ships a model.

*Rough size: 2–4 weeks, highly uncertain.*

### Phase 5 — Decide the web's fate

Deferred deliberately. Either keep the Vite PWA on the shared core (two UIs, one
brain — fine, since the marketing pages need to be real web anyway), or collapse
it onto Expo web via react-native-web. **Don't decide this now.** During the
migration the frozen web app is doing important work as the oracle, and it can't
do that if we're also rewriting it.

---

## Validators: proving nothing broke

This is the part that actually determines whether the migration is safe. Nine
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

Two things to measure early while we're in there:

- **PBKDF2 at 600,000 iterations on a low-end Android.** If that's a multi-second
  unlock, it's a UX problem. Good news: the envelope is already version-tagged
  (`v1.<salt>.<iv>.<ct>`), so the parameters *can* change without a data
  migration. Bad news: changing them splits compatibility across devices, so
  measure before deciding, not after.
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

### 8. Coverage gates — one honest number per package

Keep **100% on `packages/core`**, where it's meaningful and already true. Do
*not* extend it to `apps/mobile`: chasing 100% through gesture handlers and
native module mocks produces test theatre, not safety. Propose ~90% lines on the
mobile shell.

**This is a decision that needs a human call**, since the current 100% gate is a
deliberate project value and I'd be relaxing it. Flagging rather than assuming.

### 9. CI shape

| Job | Trigger |
|---|---|
| `apps/web` build + 100% coverage (existing, untouched) | every push |
| `packages/core` on Node | every push |
| `packages/core` on Hermes | every push |
| crypto compatibility vectors | every push |
| `apps/mobile` jest-expo | every push |
| EAS build + Maestro | nightly + `e2e` label |

---

## Risks and open questions

**Technical**

- Cross-platform `_enc` compatibility — highest severity, mitigated by #4.
- Hermes `Intl` divergence across 12 call sites — mitigated by #2 and #3.
- PBKDF2 600k on low-end hardware — measure in Phase 1.
- `window.confirm` → `Alert.alert` changes three delete flows from sync to
  callback-async. Small, but it's a real behaviour change in a destructive path.

**Process / cost**

- Expo Go is unavailable to us, so every contributor needs a dev build. Real
  friction, worth accepting for the LLM.
- Apple Developer ($99/yr) + Play Console ($25 one-off), plus App Store review
  latency on a finance app.
- The 100% coverage gate can't survive contact with native UI as written.

**Needs a decision from you**

1. Relax the coverage gate for the mobile shell? (recommend: yes, 100% core / 90% shell)
2. Does the web app stay after native ships, or fold into Expo web? (recommend: defer to Phase 5)
3. Are we shipping to both stores at once, or iOS first? (recommend: iOS first — it's the "iPhone-first" app already)
4. LLM weights downloaded on first run, or bundled? (recommend: downloaded)
