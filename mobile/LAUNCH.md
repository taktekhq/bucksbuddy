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
- [ ] Store credentials so `--auto-submit` works unattended: iOS is already
      pointed at its App Store Connect record (`eas.json` → `submit.production
      .ios.ascAppId`), Android needs the Google Service Account key from §3.4.

**"Link your project with third-party services"** in the Expo dashboard is
optional. It wires up crash/error reporting (Sentry and similar). This app has
none today, and PostHog is already integrated in-app, so you can skip it. Worth
revisiting only if you want native crash reports later.

---

## 2. Apple — Developer + App Store Connect

- [ ] **App Store Connect → My Apps → New App.** Bundle ID
      `io.taktek.bucksbuddy`, primary language, and `io.taktek.bucksbuddy`
      as the SKU (private, permanent, only ever seen in sales reports).
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
      Apple provider in Supabase with `io.taktek.bucksbuddy` as an authorized
      client ID. It needs a dev build — the entitlement isn't in Expo Go.
- [ ] **Demo account** in review notes. Reviewers cannot use Google SSO
      reliably. Give them the email/password path and tell them the carrot must
      be tapped seven times to reveal it, or they will not find it.
- [ ] Age rating, category (Finance), support URL, marketing URL, screenshots
      (6.7" and 6.5" iPhone required), and the privacy policy URL
      (`https://bucksbuddy.com/privacy`).

---

## 3. Google Play Console

### 3.0 Which account is which

Three identities are involved and **none of them has to match the others**.
Getting this straight up front saves an afternoon:

| What | Who owns it | Why it can differ |
| --- | --- | --- |
| Expo / EAS project | the **taktekhq** org (`app.json` → `owner`) | EAS only needs to *hold* the store credentials; it never authenticates to Google as you. |
| Google Play developer account | **nizar.mah99@gmail.com** (personal) | This is the account that hosts, owns and gets paid for the listing. |
| Google Cloud project holding the publishing service account | **nizar.mah99@gmail.com** (personal — see 3.2) | Play grants the service account access by *invitation*, not by shared ownership, so the key may come from any Cloud project. |

`nizar@taktek.io` is the Google account the browser is signed into by default,
which is exactly how this goes wrong: both the Cloud console and Play Console
silently act as whichever account is `authuser=0`.

**Invite the work account into Play Console and most of that problem goes
away.** *Users and permissions → Invite new users* takes any Google account,
including a Workspace one on another domain; give `nizar@taktek.io` **Admin**
and it can create the app, manage releases, edit the listing and even run the
service-account invitation in §3.3 — all without switching profiles. Adding a
user never transfers ownership: the developer account, its payments profile
and its verified identity stay with `nizar.mah99@gmail.com`, and only a
deliberate ownership transfer (7-day hold, identity re-verification) would
change that.

Two things the invitation does **not** buy, both worth knowing before you rely
on it:

- **The service account in §3.2 still has to be created from the personal
  account.** The blocker there is a Google *Cloud* org policy on taktek.io, and
  it is evaluated on where the project sits in the resource hierarchy — not on
  what the signed-in human may do in Play Console. Worse, a Workspace identity
  cannot opt out: every project a `taktek.io` user creates is auto-parented to
  the `taktek.io` organisation, so there is no "No organisation" option to
  pick. That step, and only that step, needs a separate Chrome profile (or an
  incognito window) signed in as `nizar.mah99@gmail.com`. It is five minutes,
  once, ever.
- **It does not change the account's type.** The closed-testing rule below
  attaches to the developer account being a personal one, not to who is logged
  into it. Inviting a Workspace account does not make it an organisation
  account.

So: sign in as the personal account for §3.2, and use whichever account is
convenient for the rest — but check the avatar in the top right before every
irreversible click.

The package name `io.taktek.bucksbuddy` is fine on a personal account. Play
does not verify that you own the domain in a package name — the only thing
that ever needs `taktek.io` proven is Android App Links, which this app does
not use.

> **Before committing to the personal account, know the two costs.** A personal
> developer account created on or after 13 November 2023 must run a *closed
> test with at least 12 testers opted in continuously for 14 days* before it
> may apply for production access; organisation accounts are exempt. Personal
> accounts also have to display a contact address publicly on the listing.
> If the account predates that date, neither applies and there is nothing to
> weigh. Otherwise the choice is between a fortnight of testing on the personal
> account and a second 25 USD registration for a taktek.io organisation
> account. The rest of this section works either way.

### 3.1 The app record

- [ ] **Create the app** in Play Console, package `io.taktek.bucksbuddy`.
      One-time 25 USD registration if you have not already.
- [ ] Content rating questionnaire, target audience, privacy policy URL
      (`https://bucksbuddy.com/privacy`), category (Finance), screenshots.
- [ ] **Data safety form.** Same disclosures as Apple's label: email address,
      user ID, financial info, product interaction; encrypted in transit; users
      can request deletion.
- [ ] **Account deletion URL.** Play requires a *web page* where deletion can be
      requested without installing the app. In-app deletion alone is not
      enough. Add a short section to the existing web app (e.g.
      `bucksbuddy.com/delete-account`) explaining the in-app route and giving
      the support email as a fallback.

### 3.2 The service account — create it under the personal account

This is the credential EAS uses to upload, and the one step that genuinely
requires the personal account (see 3.0). Signed in as
**nizar.mah99@gmail.com** — check the avatar — at `console.cloud.google.com`:

- [ ] **New project** — name it something like `bucksbuddy-publishing`. When
      asked for a *Location / Organisation*, leave it **"No organisation"**.
- [ ] **Enable the Google Play Android Developer API**
      (`androidpublisher.googleapis.com`) on that project.
- [ ] **IAM & Admin → Service Accounts → Create service account.** Name it
      `eas-play-publisher`. **Skip the "grant this service account access to
      the project" step** — it needs no Cloud IAM role at all. Every permission
      it will ever use is granted on the Play Console side, in 3.3.
- [ ] Open the new account → **Keys → Add key → Create new key → JSON**. The
      file downloads once and cannot be re-downloaded. Keep it out of the repo;
      `mobile/.gitignore` already refuses `*-service-account*.json` as a
      backstop.
- [ ] Copy the service account's **email** — it looks like
      `eas-play-publisher@bucksbuddy-publishing.iam.gserviceaccount.com`. That
      string is what Play Console needs.

**Why not the taktek.io org?** Two reasons, and the first is a hard blocker.
Google enforces a secure-by-default org policy bundle on every organisation
created on or after 3 May 2024, and it includes
`iam.disableServiceAccountKeyCreation` — the "Create new key → JSON" step above
simply fails inside such an org until an org policy admin adds a project-level
exception. Second, a credential that lives in the work org is a credential that
dies when the Workspace seat does, taking automated publishing of a personally
owned listing with it. If you do want it under taktek.io anyway, it works —
someone with `orgpolicy.policyAdmin` has to override that constraint for the
one project first.

### 3.3 Invite the service account into Play Console

Back in Play Console, as either account once 3.0's invitation is done:

- [ ] **Users and permissions → Invite new users.** Paste the
      `…iam.gserviceaccount.com` email. It is treated as an ordinary user.
- [ ] Under **App permissions**, click *Add app*, pick **BucksBuddy**, and grant
      only that app — not account-level access:
      - View app information (read-only)
      - Edit and delete draft apps
      - Release to production, exclude devices, and use Play App Signing
      - Release apps to testing tracks
      - Manage testing tracks and edit tester lists
      - Manage store presence

      (Play auto-selects a few read-only siblings; that is expected.)
- [ ] Leave every **Account permissions** box unchecked. Nothing here needs to
      touch billing, users or the developer account itself.
- [ ] Send the invite. There is no acceptance step — a service account is
      active immediately.

Permissions can take a few minutes to propagate. A submit that fails with a
403 right after inviting is usually just impatience.

### 3.4 Hand the key to EAS

Run from `mobile/`, signed into Expo as a member of **taktekhq**:

- [ ] `npx eas-cli credentials --platform android` → *production* →
      **Google Service Account** → *Manage your Google Service Account Key for
      Play Store submissions* → **Set up a Google Service Account Key** →
      upload the JSON.
- [ ] **Delete the local JSON afterwards.** EAS holds it now, and `eas.json`
      deliberately has no `serviceAccountKeyPath` so nothing expects the file
      to exist on anyone's disk.
- [ ] `eas.json` already carries the Android submit config: track `internal`,
      release status `completed`. Builds land with the internal testers and
      promotion to production stays a deliberate click in Play Console.

### 3.5 The first upload is manual — after that it is automatic

The Play Developer API cannot create the first release of an app; it can only
add to one that already exists. So exactly once:

- [ ] `npx eas-cli build --profile production --platform android` (an `.aab` —
      the profile already builds an app bundle rather than an APK).
- [ ] Download it from the build page and upload it **by hand** into the
      internal testing track in Play Console. Accept Play App Signing when
      offered; EAS keeps the upload key, Google keeps the signing key.
- [ ] Then prove the automated path works end to end:
      `npx eas-cli submit --platform android --profile production --latest`.

From then on, one command builds and ships:

```
npx eas-cli build --profile production --platform android --auto-submit
```

…or the **Mobile release** workflow in §6, which does the same thing from the
Actions tab.

---

> **The identifier is `io.taktek.bucksbuddy`** — taktek.io reversed. It is
> permanent once an App Store Connect record exists or an Android build is
> published, so it was corrected before either happened.

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
- [x] **Error tracking is wired up**: an error boundary catches render crashes,
      a global handler catches everything thrown outside React, and both report
      through `posthog.captureException`. Connect the EAS integration
      (`eas integrations:posthog:connect`) with a personal API key using the
      "Source map upload" preset so a stack trace names real files instead of
      `index.bundle:1:284719`.
- [ ] If you ever enable session replay on mobile, revisit §7 — it records far
      more than eight events and changes what you must disclose.

---

## 6. GitHub

- [x] `.github/workflows/ci.yml` already runs the mobile suite (type-check plus
      the 100% coverage gate) alongside the web one. Tests need no credentials.
- [x] `.github/workflows/release-mobile.yml` builds the production artefact and
      auto-submits it. It is **dispatch-only** — a release is a decision, not a
      consequence of merging — with a platform picker and a *submit* toggle.
- [ ] **Add `EXPO_TOKEN`** as a repository secret (Expo dashboard → Access
      Tokens, an org token for taktekhq) — the release workflow is the only
      thing that needs it. No Google or Apple secret belongs in GitHub: both
      live on EAS, which is what §3.4 sets up.
- [ ] Run it once with *submit* off to confirm the token works, before trusting
      it with a real release.

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
