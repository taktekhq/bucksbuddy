# Shipping BucksBuddy to the App Store and Play Store

Everything that has to be set up outside this repo, in the order it unblocks
work. Tick items off as you go — this file is version-controlled on purpose.

The web app keeps running untouched throughout. Only the last step touches it,
once the mobile apps are actually live.

---

## 0. Done — the policy and the analytics

Both apps' privacy pages now disclose the analytics, correct the "Google is the
only way in" claim, describe what the mobile apps keep on the device, and note
that the stores distribute the apps. Terms gained one line about Apple and
Google. "Last updated" is September 2026.

The app also **no longer sends the email address to PostHog** — `identify()`
carries the account ID alone, which is all that is needed to avoid
double-counting one person. That keeps *Contact Info → Email Address* off the
"used for analytics" side of both stores' forms and matches what the policy
now says.

---

## 1. Expo / EAS

Run from `mobile/`.

- [x] `npx eas-cli init` — creates the project under the **taktekhq** org
      (set in `app.json`) and writes `extra.eas.projectId` back into it. Commit
      that change.
- [x] `npx eas-cli env:push --path .env --environment production` — and repeat
      for `preview` and `development`.
      **Done for this project.** `.env` is gitignored and EAS builds from git,
      so without this a build ships with no Supabase URL or key and cannot sign
      in. The two Supabase values are required; the PostHog pair is optional.
- [ ] `npx eas-cli build --profile development --platform android` — the
      quickest end-to-end proof, since Android needs no paid account and EAS
      generates the keystore for you.
- [ ] `npx eas-cli build --profile production --platform ios` — walks you
      through Apple credentials. Let EAS manage them unless you have a reason
      not to.

**"Link your project with third-party services"** in the Expo dashboard is
optional. It wires up crash/error reporting (Sentry and similar). This app has
none today, and PostHog is already integrated in-app, so you can skip it. Worth
revisiting only if you want native crash reports later.

---

## 2. Apple — Developer + App Store Connect

- [ ] **App Store Connect → My Apps → New App.** Bundle ID
      `com.taktek.bucksbuddy`, primary language, and the SKU (anything; the
      bundle ID is fine).
- [x] **Export compliance.** Already declared in `app.json`
      (`ios.infoPlist.ITSAppUsesNonExemptEncryption: false`), so App Store
      Connect stops asking on every build. `false` asserts you only use encryption that qualifies for an
      exemption, which is the usual answer for standard crypto protecting an
      app's own data. It is your determination to make, not mine — if in doubt,
      answer the questionnaire in App Store Connect once and let it record the
      answer.
- [ ] **App Privacy (the nutrition label).** Declare, at minimum:
      - *Contact Info → Email Address* — linked to identity, App Functionality
        only. PostHog no longer receives it.
      - *Identifiers → User ID* — linked to identity, App Functionality and
        Analytics.
      - *Financial Info* — the amounts. Linked to identity, App Functionality.
        Note in the description that it is end-to-end encrypted when the user
        turns a passphrase on.
      - *Usage Data → Product Interaction* — the eight PostHog events.
      Do not claim "Data Not Collected". The label must match §7's policy text.
- [ ] **Account deletion.** Required, and already built: Settings → Danger zone
      → Delete account, which calls the `delete-account` edge function. Point
      the reviewer at it in the review notes.
- [x] **Sign in with Apple** is implemented (Landing screen, the entitlement,
      and the config plugin). Two things remain and are yours: enable the
      capability on the App ID in the Apple Developer portal, and enable the
      Apple provider in Supabase with `com.taktek.bucksbuddy` as an authorized
      client ID. It needs a dev build — the entitlement isn't in Expo Go.
- [ ] **Demo account** in review notes. Reviewers cannot use Google SSO
      reliably. Give them the email/password path and tell them the carrot must
      be tapped seven times to reveal it, or they will not find it.
- [ ] Age rating, category (Finance), support URL, marketing URL, screenshots
      (6.7" and 6.5" iPhone required), and the privacy policy URL
      (`https://bucksbuddy.com/privacy`).

---

## 3. Google Play Console

- [ ] **Create the app**, package `com.taktek.bucksbuddy`. One-time 25 USD
      registration if you have not already.
- [ ] **Data safety form.** Same disclosures as Apple's label: email address,
      user ID, financial info, product interaction; encrypted in transit; users
      can request deletion.
- [ ] **Account deletion URL.** Play requires a *web page* where deletion can be
      requested without installing the app. In-app deletion alone is not
      enough. Add a short section to the existing web app (e.g.
      `bucksbuddy.com/delete-account`) explaining the in-app route and giving
      the support email as a fallback.
- [ ] Content rating questionnaire, target audience, privacy policy URL.
- [ ] Upload the `production` profile's `.aab` (the profile already builds an
      app bundle rather than an APK).

---

## 4. Supabase

- [ ] **Auth → URL Configuration → Redirect URLs**, add:
      - `bucksbuddy://**` — the native builds
      - `exp://**` — Expo Go, for development
      Without these, Google sign-in fails outside the browser.
- [ ] **Google OAuth consent screen** (in Google Cloud, not Supabase): add the
      iOS and Android client IDs if you move off the web client. The web client
      works for the Expo auth-session flow this app uses, so this is only if
      you switch to native Google Sign-In later.
- [ ] Confirm the `delete-account` edge function is deployed on production —
      both stores' deletion requirements depend on it.
- [ ] Nothing else changes. The mobile app uses the same project, same tables,
      same row-level security, same anon key.

---

## 5. PostHog

- [ ] Nothing is strictly required — `posthog-react-native` reports into the
      same project with the same key.
- [x] Every mobile event carries `platform` (`ios` / `android`); web events
      have none, so the three separate cleanly in one project.
- [ ] If you ever enable session replay on mobile, revisit §7 — it records far
      more than eight events and changes what you must disclose.

---

## 6. GitHub

- [ ] **Nothing is required today.** Tests need no credentials.
- [ ] Optional, if you want CI to build: add `EXPO_TOKEN` (Expo dashboard →
      Access Tokens) as a repository secret, then a workflow calling
      `eas build --non-interactive`.
- [x] `.github/workflows/ci.yml` already runs the mobile suite (type-check plus
      the 100% coverage gate) alongside the web one.

---

## 7. Privacy policy and terms — done

Both pages live in `src/screens/Legal.tsx` (web) and
`mobile/src/screens/Legal.tsx` (mobile), kept in step. What changed:

- The sign-in claim now admits the hand-made email/password accounts.
- An **Analytics** section names PostHog, lists the events, and states that it
  never receives amounts, notes, categories or the email address.
- An **On your device** section covers the cached entries and the encryption key
  in the keystore, and says both are erased on sign-out and account deletion.
- Terms gained a line: the apps are distributed by Apple and Google, whose terms
  cover the download.
- "Last updated" is September 2026.

Re-read them once before you submit — the store forms have to match the wording.

## 8. The web app — last, not first

Leave `bucksbuddy.com` exactly as it is until both apps are live. Then:

- [ ] Add store badges to the landing page.
- [ ] Add an Apple **smart app banner** (one `<meta>` tag in `index.html`) so
      iOS Safari offers the app.
- [ ] Add the `/delete-account` page Play requires (§3).
- [ ] Decide whether the PWA install prompt should stay. Keeping it is fine —
      some people prefer it, and it costs nothing.
