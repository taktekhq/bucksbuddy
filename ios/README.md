# BucksBuddy for iOS 🥕

A native SwiftUI version of BucksBuddy. It isn't a wrapper around the web app:
every screen is SwiftUI, the charts are Swift Charts, and the encryption is
CryptoKit. It uses the **same Supabase project, tables and accounts** as
[bucksbuddy.com](https://bucksbuddy.com), so you can sign in on the phone
and the web and see the same entries on both. That includes end-to-end
encrypted accounts.

- **Requirements:** Xcode 16+, iOS 17+ (iPhone).
- **Dependencies:** one Swift package, [`supabase-swift`](https://github.com/supabase/supabase-swift) 2.x.
  Xcode resolves it on first open.

## Run it

1. Copy the secrets template and paste in the Supabase **anon** key. It's the
   same public key the web app ships in its bundle (`VITE_SUPABASE_ANON_KEY`):

   ```bash
   cp ios/Config/Secrets.example.xcconfig ios/Config/Secrets.xcconfig
   # edit SUPABASE_ANON_KEY = …
   ```

   `Secrets.xcconfig` is git-ignored. The host defaults to
   `bucksbuddy.supabase.co` (see `Config/BucksBuddy.xcconfig`).
2. Open `ios/BucksBuddy.xcodeproj` and run the **BucksBuddy** scheme on a
   simulator.
3. To run on a device, set `DEVELOPMENT_TEAM` in `Secrets.xcconfig`. The bundle
   id is `io.taktek.bucksbuddy`. Set `BB_BUNDLE_ID` there too if you sign with a
   different team.

Tests: ⌘U in Xcode, or

```bash
xcodebuild test -project ios/BucksBuddy.xcodeproj -scheme BucksBuddy \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

The `iOS` GitHub workflow (`.github/workflows/ios.yml`) runs the same build and
tests on every change under `ios/`.

### TestFlight

`ios/testflight.sh` archives the app as **`io.taktek.bucksbuddy`**, signs it
with an App Store Connect API key (Xcode creates the certificate and profile
itself, `-allowProvisioningUpdates`) and uploads it. It's the same recipe as
taktekhq/closet. The **TestFlight** workflow (`.github/workflows/testflight.yml`)
runs it on a macOS runner on pushes to `main` that touch `ios/`, or by hand.

It needs these repo (or org) secrets:

| Secret | What |
|---|---|
| `ASC_KEY_P8` | The App Store Connect API key's `.p8`, base64-encoded |
| `ASC_KEY_ID` | That key's ID |
| `ASC_ISSUER_ID` | The issuer ID (App Store Connect → Users and Access → Integrations) |
| `ASC_TEAM_ID` | The 10-character Apple team ID |
| `SUPABASE_ANON_KEY` | The public anon key (same value as the web's `VITE_SUPABASE_ANON_KEY`) |

It also needs an app record for `io.taktek.bucksbuddy` in App Store Connect
(My Apps → + → New App); the API key can create the bundle id but not the
app. From a Mac you can run it locally instead:

```bash
ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_TEAM_ID=… ./ios/testflight.sh
```

App Store Connect sets the build number on each upload
(`manageAppVersionAndBuildNumber`). The version is `MARKETING_VERSION` in the
project.

### Supabase settings for sign-in

- **Google:** add `bucksbuddy://auth-callback` to *Authentication → URL
  Configuration → Redirect URLs*. The app opens Google in an in-app browser
  sheet (`ASWebAuthenticationSession`) using PKCE, and that URL hands the
  session back to the app.
- **Email + password** works with no extra setup. As on the web, accounts are
  created by Google sign-in or by hand in the dashboard; there's no sign-up
  form.
- **Account deletion** and **feedback** call the same `delete-account` and
  `feedback` edge functions as the web app.

## What's in it

| Screen | What it does |
|---|---|
| Landing | Google sign-in, plus email + password for people without Google |
| Home | Running balance with a 30-day spend sparkline, the Safe (hidden until you tap the eye), the add form, today's entries |
| Add / edit | Amount (tap the currency code to switch), category sheet with subcategories, note with past-note chips and the recurring cheat codes. Editing opens in a sheet |
| History | Timeline by day, where back-to-back runs stack, or everything by category. Search, swipe to edit or delete, pull to refresh |
| Recurring | Subscriptions, rent, salary and so on, detected on the device from your notes and dates. Monthly / yearly views |
| Stats | Month switcher, daily chart, 6-month bars, where it goes, fun facts, receipts, community counts |
| Review | The charted breakdown (recent months or all time), computed on the device from a paged, fully decrypted read |
| Safe | Move cash in and out (it leaves your balance) and track gold in grams, with a live price |
| Settings | End-to-end encryption, currencies and rates, CSV and PDF export (share sheet), feedback, delete account |
| Feedback | Files a GitHub issue with screenshots. Account data is sent only if you turn it on |

### How it maps to the web app

| Web (`src/`) | iOS (`ios/BucksBuddy/`) |
|---|---|
| `lib/crypto.ts`, `lib/e2e.ts` | `Data/Crypto.swift`: same AES-GCM / PBKDF2-SHA-256 (600k) envelopes, byte-compatible |
| `lib/store.tsx` | `Data/MoneyStore.swift` (`@Observable`) |
| `lib/currency.ts`, `lib/money.ts` | `Core/Currency.swift`, `Core/Money.swift` |
| `lib/categories.ts` | `Core/Categories.swift`: same ids, with SF Symbols in place of lucide icons |
| `lib/notes.ts`, `lib/recurring.ts` | `Core/Notes.swift`, `Core/Recurring.swift` |
| `lib/stats.ts`, `lib/history.ts` | `Core/Stats.swift`, `Core/History.swift` |
| `lib/reportDigest.ts` and related | `Core/ReviewDigest.swift` |
| `lib/csv.ts`, `lib/exportRange.ts`, `lib/pdf.ts` | `Core/Export.swift`, `UI/Components/PDFStatement.swift` |
| `docs/DESIGN_SYSTEM.md` tokens | `UI/Theme.swift`: canvas, carrot, Grobold headers, SF Rounded money, the dark rooms |

### Where it differs, on purpose

- **Native patterns over web ones.** You edit an entry in a sheet rather than
  jumping back to Home. Rows swipe and have long-press menus. Lists pull to
  refresh. History is searchable. Confirmations are system dialogs.
- **The passphrase is kept in the Keychain** (this device only, after first
  unlock) rather than `localStorage`. It still never leaves the device.
- **The offline snapshot** is written with iOS file protection
  (`.completeFileProtection`). Like the web cache, it's never written while
  the account is locked, and it's cleared on sign-out.
- **Not ported:** the marketing landing page, the public stats page for
  signed-out visitors, the password-reset email flow, and the PWA install
  hint.

## Before the App Store

- Replace the app icon (`Resources/Assets.xcassets/AppIcon.appiconset`). The
  current one is the web's 512 px icon scaled up to 1024.
- App Store guideline 4.8: an app that offers Google sign-in generally has to
  offer **Sign in with Apple** too. Supabase supports it
  (`auth.signInWithIdToken` with `.apple`); `docs/AUTH_SETUP.md` Part C covers
  the Apple side.
- Export compliance: the app only uses encryption built into iOS (HTTPS,
  CryptoKit, CommonCrypto), so `Info.plist` declares
  `ITSAppUsesNonExemptEncryption = NO` and TestFlight doesn't ask each build.
- `PrivacyInfo.xcprivacy` declares the account email and the logged entries as
  collected for app functionality, linked to the account and not used for
  tracking. Answer App Privacy in App Store Connect the same way.
