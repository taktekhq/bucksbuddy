# BucksBuddy 🥕

> What's up, Doc? — a dead-simple, iPhone-first money tracker PWA.

Record money in/out in seconds (In/Out → category → digits-only amount → save) and
see a big **green** (net positive) or **red** (net negative) number for the month.
Built as an **ultra-light client-side SPA** — it loads once, your session lives in the
browser, and every navigation is instant (no server, no per-tap round-trips).

- **Stack:** Vite + React + TypeScript + Tailwind, Supabase (Postgres + Auth) for data,
  deployed as static files on Vercel. PWA via `vite-plugin-pwa`.
- **Currency:** USD + a per-entry LBP toggle (default 89,500 LBP/$, editable in Settings).
  Stored normalized to **integer USD cents**, with the original currency/amount/rate kept
  for auditable export.
- **Auth:** Supabase **Google sign-in** (plus a hidden email + password for friends
  without Google). No emails sent. Data is isolated per-account via Row Level Security.
- **Privacy:** the money **values** (amounts, gold grams, notes) are stored encrypted
  (AES-GCM), each in its own `_enc` column; labels like category and date stay plaintext.
  By default the key is wrapped with a public constant — so it's operator-readable, the same
  as plain storage — but any user can turn on **end-to-end encryption** in Settings with a
  passphrase, after which *no one but them* (not even whoever runs the server) can read their
  amounts or notes. See **Encryption** below.
- **Export:** CSV download (client-side) for accounting.
- **Design system:** see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Setup (what you need to do)

### 1. Run the database migration

In the **Supabase Dashboard → SQL Editor**, paste and run
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Creates the
`profiles` + `transactions` tables, RLS policies, and the auto-create-profile trigger.

Then run [`0002_safe_gold.sql`](supabase/migrations/0002_safe_gold.sql) to add the
`safe_gold_entries` table (gold, in grams) for the savings **Safe** — see below. The app
degrades gracefully if it isn't applied yet (gold just reads as `0 g`). Cash in the Safe
needs no migration — it rides along in `transactions`.

> _Tidy-up note: an earlier build created a `safe_entries` table that's no longer used.
> If you ran that, you can remove the leftover with a one-time
> `drop table if exists public.safe_entries;` in the SQL Editor — optional, it's empty and
> ignored either way._

Then run [`0003_e2e.sql`](supabase/migrations/0003_e2e.sql) (the `e2e_keys` vault + the
encrypted `_enc` value columns on `transactions`) and
[`0004_e2e_gold.sql`](supabase/migrations/0004_e2e_gold.sql) (the same for the gold ledger).
Finally run [`0005_drop_plaintext_values.sql`](supabase/migrations/0005_drop_plaintext_values.sql)
to drop the now-unused plaintext columns. It's guarded — it refuses to run while any row
still has an unencrypted value, so on a fresh database (nothing to migrate) it's safe to
apply straight through.

> **Savings Safe:** a vault icon next to Settings opens a dark "Safe" screen (available
> to everyone).
> - **Cash** moved to the safe is recorded as a normal transaction with the `safe`
>   category — so it leaves your spendable balance (Out) and shows in history; taking it
>   back is an In. The safe's cash total is the all-time net of those transactions.
> - **Gold** is tracked separately in **grams** (`safe_gold_entries`); it isn't converted,
>   though the screen shows an approximate USD value from a free live price API when
>   reachable.
>
> **Subcategories:** categories with a small dot (Health → Pharmacy, Fees → Mobile,
> Food/Groceries/Coffee, …) open a second step to pick a finer label. Stored inline as
> `parent/sub` in the existing `category` field — no schema change, existing rows
> untouched.

### 2. Create your user (password sign-in)

- **Authentication → Users → Add user → Create new user.**
  - Enter your email + a password, tick **Auto Confirm User**, click **Create user**.
- **Authentication → Providers → Email:** make sure **Email** is enabled.

> The password is stored hashed in Supabase, never in the app. Use a strong one.

### 3. Environment variables (Vercel → Settings → Environment Variables)

The app accepts **either** `VITE_`-prefixed names **or** the older `NEXT_PUBLIC_` ones,
so if you already set the `NEXT_PUBLIC_*` vars they keep working. `VITE_*` is preferred:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → **Project Settings → API → Project URL** |
| `VITE_SUPABASE_ANON_KEY` | Same page → **Project API keys → `anon` / public** |
| `VITE_OWNER_EMAIL` *(optional)* | Your login email. If set, the login screen hides the email field so you only type a password. Not secret. |

> Vars are read at **build time**, so after adding/changing them, **redeploy**.
> You do **not** need the `service_role` key or a `SITE_URL` anymore.

### 4. Vercel build settings

`vercel.json` pins the framework to **Vite** (build `npm run build`, output `dist`), so a
fresh import builds correctly. If the project was previously imported as a Next.js project,
just redeploy — the `vercel.json` overrides the old preset. No rewrites are needed
(the app uses hash-based routing).

## Encryption (end-to-end)

Encryption is **opt-in, per user**, so people who'd rather not risk losing access keep the
simple, recoverable experience, while the privacy-conscious can lock the operator out.

- **How it works:** each user has one random AES-GCM **master key** that encrypts their
  entries. The master key is stored *wrapped* (encrypted) — never in the clear. We re-wrap
  the key when the passphrase changes, so the data itself is never re-encrypted.
- **Default tier:** the master key is wrapped with a public constant baked into the bundle.
  Values are still encrypted on disk, but since the constant isn't secret, they're
  operator-readable — i.e. no worse and no better than plain storage.
- **Turning it on:** Settings → Encryption → type a passphrase and turn it on. The key is
  re-wrapped under a PBKDF2 key derived from it; from then on the server only ever sees
  ciphertext for that user. Any passphrase is allowed (no strength gate).
- **Stored on the device, shown in Settings.** The passphrase is cached in this browser, so
  the app stays unlocked across restarts and you can see/change it in the Encryption card. It
  **never leaves the device** — the server still can't read it. A brand-new device (or one
  where the passphrase was changed elsewhere) starts **locked**: amounts render *obscured*
  (a garbled stand-in) until you enter the passphrase once, then it's cached there too.
- **No recovery, by design.** There is deliberately no reset: if a user forgets their
  passphrase and has no device that still has it cached, the data is unrecoverable — that's
  the proof it's truly end-to-end.
- **Scope — only the money *values*.** We encrypt what actually matters: `amount_usd_cents`,
  `original_amount` and `note` on transactions, and `grams` + `note` on gold. Each goes into
  its own `_enc` column. The **labels** (category, direction, currency, rate, date) stay as
  plaintext columns — useful, and not the secret. So the operator can see *"an Out in
  groceries on June 1"* but not the amount.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

Production build / preview:

```bash
npm run build && npm run preview
```

## Testing

**Unit / component (Vitest + Testing Library, jsdom)** — covers all the money
math, the data layer, and component behaviour, enforced at **100% coverage**.

```bash
npm test           # run once
npm run test:watch # watch mode
npm run coverage   # with the coverage report (fails under 100%)
```

## Install on iPhone

Open the deployed URL in **Safari → Share → Add to Home Screen**. It launches standalone.
Sign-in is email + password (no email link), so you stay inside the app the whole time.

## Project layout

```
index.html              app entry
src/main.tsx            mount + register service worker
src/App.tsx             auth gate + hash router
src/screens/            Login, Home, Add, Settings
src/components/          AddEntryFlow + ui/* building blocks, RecentList, RateEditor, SignOutButton
src/lib/                supabase client, store (in-memory cache), router, useSession,
                        crypto + e2e (encryption vault), currency/money/dates/csv/categories
src/types/db.ts         row types
vite.config.ts          Vite + PWA (manifest, service worker; Supabase calls never cached)
supabase/migrations/    0001_init.sql … 0003_e2e.sql, 0004_e2e_gold.sql, 0005_drop_plaintext_values.sql
docs/DESIGN_SYSTEM.md   reusable design system
```
