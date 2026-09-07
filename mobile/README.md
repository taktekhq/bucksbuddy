# BucksBuddy — mobile (Expo)

The native port of the PWA in the parent directory. Same screens, same
design tokens, same copy, same data layer; React Native instead of the DOM.
It runs in **Expo Go** today — no native build needed.

New machine? `SETUP.md` has the full clone-to-running path, the env values,
and the service accounts involved.

## Run it (remote workspace → phone)

```sh
cd mobile
cp .env.example .env        # fill in the Supabase URL + anon key
npm install
./scripts/tunnel.sh         # production JS over an Expo tunnel (default)
MODE=dev ./scripts/tunnel.sh   # dev JS with Fast Refresh, for red screens
CLEAR=1 ./scripts/tunnel.sh    # also wipe Metro's cache (after npm install)
```

The script logs to `.expo/tunnel.log`; the app URL is stable per Expo
account and port (`exp://<slug>-<user>-8081.exp.direct`). Scan the QR / open
the URL in Expo Go.

Two things the script does that matter for how the app *feels*:

- `EXPO_NO_METRO_LAZY=1` — bundle everything up front. With lazy bundling
  on, each screen's code is fetched over the tunnel the first time you open
  it, which reads as "the History page takes ages".
- `--no-dev --minify` (the default `MODE=prod`) — production JS. Dev-mode JS
  is several times slower on every interaction; judge smoothness on prod.
  Fast Refresh is off in this mode; shake → Reload after edits.

## Architecture (what maps to what)

| Web                         | Mobile                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| hash router, no transitions | `@react-navigation/native-stack` — native push/pop, edge swipe-back; `navigate("/x")` API kept (`lib/router.ts`) |
| Tailwind classes            | the same classes, via NativeWind; `tailwind.config.js` is a copy of the web's (see `PORTING.md`) |
| `shadow-card`               | the same class; rings became real borders (a spread-only shadow renders as corners on RN) |
| `.press` / `transition`     | Reanimated on the UI thread: `Press` scale, sliding segment highlights, color tweens, layout transitions |
| framer-motion swipes/sheet  | gesture-handler `Pan` + Reanimated (`SwipeRow`, `SwipeToDelete`, `CategorySheet`) |
| `<ul>` of 500 rows          | virtualized `SectionList` / `FlatList` (History)                    |
| `localStorage`              | AsyncStorage (`lib/cache.ts`, prefs)                                 |
| `<svg>` sparkline           | react-native-svg (`SparkArea`)                                       |
| CSS gradients + fixed floor | expo-linear-gradient (`Screen` / `ScreenFrame`)                      |
| Google OAuth redirect       | `expo-web-browser` auth session (`lib/oauth.ts`)                     |
| CSV download                | expo-file-system + share sheet                                       |
| `window.confirm`            | `Alert.alert`                                                        |
| WebCrypto (`lib/e2e.ts`)    | `@noble` AES-GCM + native PBKDF2 (`lib/crypto.ts`), byte-compatible  |

`PORTING.md` is the contract every screen was ported against; keep it in
sync when a rule changes.

### Encryption

React Native has no WebCrypto, so `lib/crypto.ts` implements the same AES-GCM
with `@noble`. The envelopes are byte-compatible with what the browser wrote,
which matters because the rows already in Supabase were encrypted there —
`scripts/crypto-interop.test.mts` proves it in both directions.

Key derivation is the one part that cannot be pure JavaScript. 600k PBKDF2
rounds is ~1.2M SHA-256 compressions; WebCrypto absorbs that in a few hundred
milliseconds and Hermes, which has no JIT, takes tens of seconds — long enough
that the unlock button looked broken. `lib/pbkdf2.ts` hands the loop to OpenSSL
via `react-native-quick-crypto` and keeps the `@noble` implementation as the
fallback for Expo Go and the test suite. Both produce identical bytes, and
`src/lib/pbkdf2.test.ts` asserts that they do.

Randomness comes from `lib/random`, which installs `crypto.getRandomValues`
from expo-crypto onto the global. React Native provides no `crypto` at all, and
`@noble` reads it at call time, so without this every encrypting write throws
while every read succeeds. It refuses a source that returns zeros or repeats
itself rather than encrypting with predictable bytes.

Cold start still never derives a key. A master key is generated once and only
ever re-wrapped, so this device derives it once and keeps it in the OS keystore
(`lib/vault.ts`), checked against the account verifier on load. Later launches
are a keystore read. Both that key and the cached passphrase are wiped on
sign-out and account deletion.

### Sign-in

Google and Apple, plus a hidden email/password path (tap the carrot 7 times).

Google needs the redirect allow-listed in Supabase: **Auth → URL
Configuration → Redirect URLs**, `exp://**` for Expo Go and `bucksbuddy://**`
for native builds. Apple needs none of that — iOS returns an identity token
that Supabase exchanges directly — but it does need a dev build, since the
entitlement isn't in Expo Go.

## Layout

```
src/
  App.tsx           providers + the two native stacks (signed-in / signed-out)
  screens/          one file per route, same names as the web
  components/       AddComposer, SwipeRow, History*, RateEditor
  components/ui/    primitives: Press, Screen, NavHeader, CategorySheet, …
  lib/              pure logic copied verbatim from ../src/lib, plus the
                    native replacements (router, cache, vault, oauth, posthog)
  types/db.ts       copied verbatim
scripts/tunnel.sh   the dev server launcher described above
```
