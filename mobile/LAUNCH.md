# Shipping BucksBuddy to the App Store and Play Store

Everything that has to be set up outside this repo, in the order it unblocks
work. Tick items off as you go — this file is version-controlled on purpose.

The web app keeps running untouched throughout. Only the last step touches it,
once the mobile apps are actually live.

---

## 0. Two things to fix before you submit

Both are true of the web app today, so fixing them fixes both products.

### The privacy policy doesn't mention analytics

`src/screens/Legal.tsx` says what Google data is taken and that nothing is sold,
but it never mentions PostHog. The app sends PostHog eight events
(`signed_in`, `transaction_added/updated/deleted`, `csv_exported`,
`encryption_enabled/disabled`, `account_deleted`) and calls `identify()` with
the user's **id and email address**.

An email address leaving for a third-party processor has to be disclosed. Both
stores ask you to declare it, and the declaration has to match the policy.
See §7 for the wording to add.

### The policy says Google is the only way in

> "Signing in with Google is the only way into BucksBuddy."

There is also an email/password sign-in (`signInWithPassword`, reached by
tapping the carrot seven times). It exists for one friend without a Google
account, but the sentence as written is inaccurate. See §7.

---

## 1. Expo / EAS

Run from `mobile/`.

- [ ] `npx eas-cli init` — creates the project under the **taktekhq** org
      (set in `app.json`) and writes `extra.eas.projectId` back into it. Commit
      that change.
- [ ] `npx eas-cli env:push --path .env --environment production` — and repeat
      for `preview` and `development`.
      **Required.** `.env` is gitignored and EAS builds from git, so without
      this the build ships with no Supabase URL or key and the app cannot sign
      in. None of the four values are secret (the Supabase anon key is
      protected by row-level security and already ships in the web bundle);
      they simply have to exist at build time.
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
- [ ] **Export compliance.** App Store Connect asks about encryption on every
      build. The app uses AES-256-GCM to protect the user's own data. Add the
      declaration to `app.json` so you aren't asked each time:

      "ios": { "infoPlist": { "ITSAppUsesNonExemptEncryption": false } }

      Setting `false` asserts you only use encryption that qualifies for an
      exemption, which is the usual answer for standard crypto protecting an
      app's own data. It is your determination to make, not mine — if in doubt,
      answer the questionnaire in App Store Connect once and let it record the
      answer.
- [ ] **App Privacy (the nutrition label).** Declare, at minimum:
      - *Contact Info → Email Address* — linked to identity, used for App
        Functionality **and Analytics** (PostHog receives it).
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
- [ ] **Sign in with Apple.** Apple's guideline 4.8 requires it *if* you offer
      other third-party sign-in. You offer Google, so **expect this to be
      raised**. Options: add Sign in with Apple (Supabase supports it), or
      argue the exemption. Cheapest path is to add it — budget for this rather
      than being surprised in review.
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
- [ ] **Recommended:** add a `platform` property (`web` / `ios` / `android`) so
      the two products don't blur together in the same funnels. One line where
      the client is created.
- [ ] If you ever enable session replay on mobile, revisit §7 — it records far
      more than eight events and changes what you must disclose.

---

## 6. GitHub

- [ ] **Nothing is required today.** Tests need no credentials.
- [ ] Optional, if you want CI to build: add `EXPO_TOKEN` (Expo dashboard →
      Access Tokens) as a repository secret, then a workflow calling
      `eas build --non-interactive`.
- [ ] Worth doing regardless: extend `.github/workflows/ci.yml` to run the
      mobile suite (`cd mobile && npm ci && npm run coverage`) so the 100% gate
      applies to both apps.

---

## 7. Privacy policy and terms — what to change

Both live in one page, `src/screens/Legal.tsx` in the **web** app, served at
`/privacy` and `/terms`. The mobile app links to the same page, so editing it
once covers both. Three changes:

**a. Correct the sign-in claim.** Replace "Signing in with Google is the only
way into BucksBuddy" with wording that admits the password path, e.g. "Most
people sign in with Google; a small number of accounts we create by hand use an
email and password."

**b. Disclose the analytics.** Add a short section:

> **Analytics.** We use PostHog to count how the app is used — when someone
> signs in, adds or edits an entry, exports a CSV, or turns encryption on or
> off. PostHog receives your account ID and email address so those counts can
> be tied to one person rather than double-counted. It never receives your
> amounts, notes or categories. PostHog processes this on our behalf and does
> not sell it.

**c. Say the apps exist.** Once they are live, add a line that the same account
and data are available in the iOS and Android apps, and that the mobile apps
store data on the device (a cached copy of your entries, and your encryption
key in the device keystore) which is removed when you sign out or delete your
account.

**Terms** need no change for launch. The existing three points still hold. When
you list on the stores you may want one line noting the apps are distributed
through Apple and Google and are subject to their terms as well.

Bump "Last updated" when you publish the changes.

---

## 8. The web app — last, not first

Leave `bucksbuddy.com` exactly as it is until both apps are live. Then:

- [ ] Add store badges to the landing page.
- [ ] Add an Apple **smart app banner** (one `<meta>` tag in `index.html`) so
      iOS Safari offers the app.
- [ ] Add the `/delete-account` page Play requires (§3).
- [ ] Decide whether the PWA install prompt should stay. Keeping it is fine —
      some people prefer it, and it costs nothing.
