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
| Tailwind classes            | `StyleSheet` + `lib/theme.ts` (exact values; see `PORTING.md`)      |
| `shadow-card`, rings        | CSS `boxShadow` strings (new-architecture RN renders them verbatim)  |
| `.press` / `transition`     | Reanimated on the UI thread: `Press` scale, sliding segment highlights, color tweens, layout transitions |
| framer-motion swipes/sheet  | gesture-handler `Pan` + Reanimated (`SwipeRow`, `SwipeToDelete`, `CategorySheet`) |
| `<ul>` of 500 rows          | virtualized `SectionList` / `FlatList` (History)                    |
| `localStorage`              | AsyncStorage (`lib/cache.ts`, prefs)                                 |
| `<svg>` sparkline           | react-native-svg (`SparkArea`)                                       |
| CSS gradients + fixed floor | expo-linear-gradient (`Screen` / `ScreenFrame`)                      |
| Google OAuth redirect       | `expo-web-browser` auth session (`lib/oauth.ts`)                     |
| CSV download                | expo-file-system + share sheet                                       |
| `window.confirm`            | `Alert.alert`                                                        |
| WebCrypto (`lib/e2e.ts`)    | **stubbed** — see below                                              |

`PORTING.md` is the contract every screen was ported against; keep it in
sync when a rule changes.

### Encryption is stubbed (on purpose)

Expo Go has no WebCrypto, so `lib/vault.ts` exposes the crypto seam as a
`Vault` port and ships an Expo Go implementation that reports every account
as *locked*. That is the exact state the web app shows on a device that
hasn't been unlocked yet: rows load with plaintext labels and a cipher
fragment where the amount would be, stats wear the cipher, and writes are
refused with a clear message. Every screen renders and navigates; nothing
decrypts.

The last step of the port — a real `Vault` (native WebCrypto in a dev build,
or a pure-JS AES-GCM/PBKDF2) — swaps that one export. Nothing else changes.

### Google sign-in

Supabase must allow the redirect back into the app: **Auth → URL
Configuration → Redirect URLs**, add `exp://**` for Expo Go and
`bucksbuddy://**` for the native build. The hidden email/password sign-in
(tap the carrot 7 times on the landing page) works without any of that.

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
