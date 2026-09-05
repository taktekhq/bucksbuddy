# BucksBuddy — mobile (Expo)

The native port of the PWA in the parent directory. Same screens, same
design tokens, same data layer; React Native instead of the DOM. It runs in
**Expo Go** today — no native build needed.

## Run it (remote workspace → phone)

```sh
cd mobile
cp .env.example .env        # fill in the Supabase URL + anon key
npm install
npx expo start --tunnel     # prints a QR code + an exp:// URL
```

`--tunnel` routes the dev server through Expo's ngrok so a phone that isn't
on the workspace's network can load it. Scan the QR with the Camera (iOS) or
the Expo Go app (Android), or open the `exp://…` URL in Expo Go.

## What's ported, what's stubbed

Everything in `src/` mirrors `../src/`:

| Web                      | Mobile                                   |
| ------------------------ | ---------------------------------------- |
| Tailwind classes         | `StyleSheet` + tokens in `lib/theme.ts`   |
| hash router              | in-memory router (`lib/router.ts`)        |
| `localStorage`           | AsyncStorage (`lib/cache.ts`, prefs)      |
| framer-motion swipes     | gesture-handler + reanimated              |
| framer-motion sheet      | `Modal` + reanimated (`CategorySheet`)    |
| `<svg>` sparkline        | react-native-svg (`SparkArea`)            |
| CSS gradients            | expo-linear-gradient (`Screen`)           |
| Google OAuth redirect    | `expo-web-browser` auth session           |
| CSV download             | expo-file-system + share sheet            |
| `window.confirm`         | `Alert.alert`                             |
| WebCrypto (`lib/e2e.ts`) | **stubbed** — see below                   |

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
  App.tsx           providers + the route switch (mirrors ../src/App.tsx)
  screens/          one file per route, same names as the web
  components/       AddComposer, SwipeRow, History*, RateEditor
  components/ui/    primitives: Press, Screen, NavHeader, CategorySheet, …
  lib/              pure logic copied verbatim from ../src/lib, plus the
                    native replacements (router, cache, vault, oauth, posthog)
  types/db.ts       copied verbatim
```
