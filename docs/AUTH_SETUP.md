# BucksBuddy — Auth setup checklist (Google + Apple via Supabase)

Follow these **in order**. Each part ends with something you paste into the next part.
Your fixed callback URL after Part A is:

```
https://bucksbuddy.supabase.co/auth/v1/callback
```

Use that exact URL anywhere a provider asks for a "redirect" or "return" URL.

---

## Part A — Claim the Supabase vanity subdomain (do this first)

So your callback is branded before you wire up Google/Apple. CLI only; included
with your Pro plan at no extra cost. Run on your own machine:

1. Install the CLI: `brew install supabase/tap/supabase` (or use `npx supabase ...`).
2. Log in: `supabase login` (opens the browser).
3. Find your **project ref**: Supabase Dashboard → Project Settings → General → Reference ID.
4. Check the name is free:
   ```
   supabase vanity-subdomains --project-ref <ref> check-availability \
     --desired-subdomain bucksbuddy --experimental
   ```
5. Claim it:
   ```
   supabase vanity-subdomains --project-ref <ref> activate \
     --desired-subdomain bucksbuddy --experimental
   ```
6. In **Vercel** → Project → Settings → Environment Variables, set
   `VITE_SUPABASE_URL = https://bucksbuddy.supabase.co` (and update local `.env.local`).
   Redeploy after.

> ⚠️ Vanity subdomain and a custom domain (`api.bucksbuddy.com`) are mutually
> exclusive — you can't have both. This path = no custom domain.

---

## Part B — Google sign-in

In **[console.cloud.google.com](https://console.cloud.google.com)**:

1. **New Project** (top bar) → name it "BucksBuddy" → select it.
2. **APIs & Services → OAuth consent screen:**
   - User type: **External** → Create.
   - App name: BucksBuddy. User support email: yours. Developer contact: yours.
   - Authorized domains: add `supabase.co`.
   - Scopes: leave defaults (email, profile, openid). Save through.
   - **Click "Publish App"** → confirm. (Until published, only test users can log in —
     publishing is what opens signup to everyone. No review needed for basic scopes.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID:**
   - Application type: **Web application**. Name: "BucksBuddy Web".
   - **Authorized redirect URIs → Add URI:** `https://bucksbuddy.supabase.co/auth/v1/callback`
   - Create → copy the **Client ID** and **Client Secret**.
4. **Supabase → Authentication → Providers → Google:** toggle on, paste Client ID +
   Secret, Save.

✅ Google is testable on `localhost`.

---

## Part C — Apple sign-in (needs paid Apple Developer Program, $99/yr)

In **[developer.apple.com](https://developer.apple.com)** → Certificates, Identifiers & Profiles:

1. **App ID** — Identifiers → **+** → **App IDs** → App. Pick a Bundle ID
   (e.g. `com.bucksbuddy.app`), enable the **Sign In with Apple** capability. Register.
2. **Services ID** — Identifiers → **+** → **Services IDs**. Description "BucksBuddy Web",
   identifier e.g. `com.bucksbuddy.web`. **This identifier is your Client ID.** Register,
   then open it, enable **Sign In with Apple → Configure:**
   - Primary App ID: the one from step 1.
   - **Domains and Subdomains:** `bucksbuddy.supabase.co`
   - **Return URLs:** `https://bucksbuddy.supabase.co/auth/v1/callback`
   - Save.
3. **Key** — Keys → **+** → name it, enable **Sign In with Apple**, Configure (primary App ID),
   Continue → **Register → Download the `.p8` file** (you can only download it ONCE).
   Note the **Key ID** shown, and your **Team ID** (top-right of the developer account).
4. **Generate the client secret (a JWT):** use Supabase's generator at the bottom of the
   Apple guide → [supabase.com/docs/guides/auth/social-login/auth-apple](https://supabase.com/docs/guides/auth/social-login/auth-apple).
   Feed it: Team ID, Key ID, the Services ID, and the `.p8` contents. Copy the JWT it produces.
   > ⚠️ This secret **expires every 6 months** — set a calendar reminder to regenerate it,
   > or logins will start failing.
5. **Supabase → Authentication → Providers → Apple:** toggle on.
   - **Client IDs:** your Services ID (`com.bucksbuddy.web`).
   - **Secret Key (for OAuth):** the JWT from step 4. Save.

⚠️ Apple will **not** redirect to `localhost` — test the Apple button only on the
deployed HTTPS site, not locally.

---

## Part D — Finish in Supabase + test

1. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** your production URL (e.g. `https://bucksbuddy.com`).
   - **Redirect URLs:** add `https://bucksbuddy.com` and `http://localhost:5173`.
2. Make sure both Google and Apple providers show **enabled**.
3. **Test Google locally** (`npm run dev`) → Continue with Google → land back signed in.
4. **Test Apple on the deployed site** → Continue with Apple.
5. Confirm a second, different account sees none of the first account's data (RLS isolation).

---

### Notes
- The code side is already done (Google + Apple buttons, OAuth redirect handling).
  These steps are all dashboard/config — no code changes needed.
- Apple-specific quirks: it returns the user's name only on the *first* sign-in, and
  the email may be a private `@privaterelay.appleid.com` relay (still verified).
