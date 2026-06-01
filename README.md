# BucksBuddy 🥕

> What's up, Doc? — a dead-simple, iPhone-first money tracker PWA.

Record money in/out in seconds (In/Out → category → digits-only amount → save) and
see a big **green** (net positive) or **red** (net negative) number for the month.
Built with **Next.js (App Router) + Supabase + Tailwind**, installable as a PWA, and
exportable to CSV for accounting.

- **Currency:** USD, plus an optional LBP toggle per entry (default rate 89,000 LBP / $1,
  editable in Settings). Everything is stored normalized to **integer USD cents**, with the
  original currency/amount/rate kept for auditable export.
- **Auth:** Supabase email **6-digit code** (single owner) — enter your email, get a code, type it in. No leaving the app. Data is private via Row Level Security.
- **Design system:** see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Setup (what you need to do)

### 1. Run the database migration

In the **Supabase Dashboard → SQL Editor**, paste and run
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
This creates the `profiles` and `transactions` tables, RLS policies, and the
auto-create-profile-on-signup trigger.

### 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and in a local
`.env.local`, copied from [`.env.example`](.env.example)):

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → **Project Settings → API → Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → **Project API keys → `anon` / public** |
| `NEXT_PUBLIC_SITE_URL` | Your deployed origin, e.g. `https://bucksbuddy.vercel.app` (no trailing slash). Local: `http://localhost:3000` |

> You do **not** need the `service_role` key — RLS + the anon key + the user session is enough.

### 3. Supabase Auth: enable the email code

Sign-in uses a **6-digit email code** (not a magic link), so the email must contain
the code token:

- **Authentication → Providers → Email:** enabled.
- **Authentication → Emails → Templates → "Magic Link":** make sure the template
  includes the code token `{{ .Token }}`. The default template only has the link
  (`{{ .ConfirmationURL }}`), so add a line such as:

  ```html
  <p>Your BucksBuddy code is: <strong>{{ .Token }}</strong></p>
  ```

- **Authentication → URL Configuration → Site URL:** set to your production URL
  (used for emails). Redirect-URL allow-listing isn't required for the code flow,
  but it's fine to leave defaults in place.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

The service worker is disabled in dev. To test the PWA, run a production build:

```bash
npm run build && npm start
```

## Install on iPhone

Open the deployed URL in **Safari → Share → Add to Home Screen**. It launches
standalone (no Safari chrome). Because sign-in uses an emailed code (not a link),
you stay inside the app the whole time — no Safari/PWA session mismatch.

## Project layout

```
app/            routes (home, add, settings, login, auth callbacks, export, manifest, sw)
components/     UI (AddEntryFlow + ui/* building blocks, RecentList, RateEditor, SignOutButton)
lib/            currency/money/dates/csv/categories + supabase clients (client/server/middleware)
supabase/       migrations/0001_init.sql
docs/           DESIGN_SYSTEM.md
scripts/        generate-icons.mjs (regenerate app icons)
```

## Regenerating icons

```bash
node scripts/generate-icons.mjs   # writes public/icons/*
```
