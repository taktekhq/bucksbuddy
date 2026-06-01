# BucksBuddy 🥕

> What's up, Doc? — a dead-simple, iPhone-first money tracker PWA.

Record money in/out in seconds (In/Out → category → digits-only amount → save) and
see a big **green** (net positive) or **red** (net negative) number for the month.
Built with **Next.js (App Router) + Supabase + Tailwind**, installable as a PWA, and
exportable to CSV for accounting.

- **Currency:** USD, plus an optional LBP toggle per entry (default rate 89,000 LBP / $1,
  editable in Settings). Everything is stored normalized to **integer USD cents**, with the
  original currency/amount/rate kept for auditable export.
- **Auth:** Supabase **email + password** (single owner) — no emails sent, no rate limits. Data is private via Row Level Security.
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
| `NEXT_PUBLIC_OWNER_EMAIL` *(optional)* | Your login email. If set, the login screen hides the email field so you only type a password. Not secret. |

> You do **not** need the `service_role` key — RLS + the anon key + the user session is enough.

### 3. Supabase Auth: create your user (password sign-in)

Sign-in uses **email + password** — no emails are sent, so you never hit Supabase's
email rate limit. Create your account once in the dashboard:

- **Authentication → Users → Add user → Create new user.**
  - Enter your email and a password.
  - Tick **Auto Confirm User** (so no confirmation email is needed).
  - Click **Create user**.
- **Authentication → Providers → Email:** make sure **Email** is enabled (password
  sign-in lives here). You can leave "Confirm email" however you like — it doesn't
  matter when you create the user pre-confirmed in the dashboard.

To add or change the password later, open the user in **Authentication → Users**.

> The password is stored hashed in Supabase, never in the app code. Per-user RLS
> still keeps the data private. Use a strong password since the app URL is public.

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
standalone (no Safari chrome). Because sign-in is email + password (no email link),
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
