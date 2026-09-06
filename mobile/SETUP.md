# Setting this up on a new machine

Everything needed to go from a fresh clone to a running app, and to the
services behind it. `LAUNCH.md` covers the store submissions; this is the
developer setup.

## 1. Install

```sh
cd mobile
npm ci
```

Node 22 or newer. Nothing else is required globally — the Expo and EAS CLIs
are invoked through `npx`.

## 2. Environment variables

Create `mobile/.env`. It is gitignored, so it never travels with the clone.

```sh
EXPO_PUBLIC_SUPABASE_URL=https://bucksbuddy.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<Supabase → Project Settings → API → anon key>
EXPO_PUBLIC_POSTHOG_KEY=<PostHog → Project Settings → Project API Key>
EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Faster, and the reason the values aren't written out here — pull them from EAS,
which already has all three environments:

```sh
npx eas-cli login
npx eas-cli env:pull --environment production   # writes .env
```

`bucksbuddy.supabase.co` is the project's vanity domain; the generated
`oezaeieadtmrfrevlkbh.supabase.co` reaches the same project. The two Supabase
values are required — without them the app cannot sign in. The PostHog pair is
optional: analytics degrade to a silent no-op when the key is unset.

## 3. Run it

```sh
./scripts/tunnel.sh              # production JS over an Expo tunnel
MODE=dev ./scripts/tunnel.sh     # dev JS with Fast Refresh
CLEAR=1 ./scripts/tunnel.sh      # also wipe Metro's cache (after npm install)
```

Scan the QR with Expo Go. The tunnel is what makes this work from a remote
machine; the URL is stable per Expo account and port. See `README.md` for why
production mode is the default.

## 4. Tests

```sh
npm test          # unit suite
npm run coverage  # adds the 100% gate CI enforces
npx tsc --noEmit  # strict type-check
```

The crypto interop check runs outside jest, because it drives the browser's
WebCrypto against the app's pure-JS implementation to prove the envelopes match
what is already stored in Supabase:

```sh
node --experimental-strip-types scripts/crypto-interop.test.mts
```

## 5. EAS (only when building)

Already done for this project — repeat only if you ever start fresh.

```sh
npx eas-cli login
npx eas-cli init --non-interactive --force        # writes extra.eas.projectId
npx eas-cli env:push production  --path .env --force
npx eas-cli env:push preview     --path .env --force
npx eas-cli env:push development --path .env --force
```

`app.json` records who owns it (`owner: taktekhq`) and the linked project id.
Both are committed, so a new clone is already pointed at the right project and
only needs `eas-cli login`.

Builds:

```sh
npx eas-cli build --profile development --platform android   # no paid account
npx eas-cli build --profile production  --platform ios       # needs Apple
```

## 6. Services this app talks to

| Service | What it needs |
| --- | --- |
| Supabase | `bucksbuddy.supabase.co`. Auth redirect URLs must include `exp://**` (Expo Go) and `bucksbuddy://**` (native builds), or Google sign-in fails. |
| PostHog | The key above, EU host. Nothing to configure per machine. |
| Apple | A Developer membership, for iOS builds and Sign in with Apple. |
| Google Play | A Play Console account, for Android release builds. |
| Expo/EAS | An account with access to the `taktekhq` org. |

## 7. Gotchas that cost time before

- **Styling silently does nothing** if `global.css` isn't imported from
  `src/App.tsx`, or if `babel-preset-expo` isn't a top-level dependency. Both
  are already wired; don't "tidy" them away.
- **Stay on NativeWind 4 + Tailwind 3.** The v5 preview emits CSS that Expo's
  parser rejects, and Tailwind 3 is what the web app uses, so the config copies
  across unchanged.
- **Restart with `CLEAR=1`** after changing `tailwind.config.js`, `global.css`,
  `babel.config.js` or `metro.config.js`. Metro caches the compiled CSS.
- **Sign in with Apple needs a dev build.** The entitlement isn't in Expo Go, so
  the button renders there but the sheet fails.
