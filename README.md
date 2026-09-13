# BucksBuddy 🥕

> What's up, Doc? — a dead-simple, iPhone-first money tracker PWA.

Record money in/out in seconds (In/Out → category → digits-only amount → save) and
see a big **green** (net positive) or **red** (net negative) number for the month.
Built as an **ultra-light client-side SPA** — it loads once, your session lives in the
browser, and every navigation is instant (no server, no per-tap round-trips).

- **Stack:** Vite + React + TypeScript + Tailwind, Supabase (Postgres + Auth) for data,
  deployed as static files on Vercel. PWA via `vite-plugin-pwa`.
- **Currency:** pick a **main currency** (USD, EUR, LBP, GBP, … — a curated list in
  `src/lib/currency.ts`) and any number of **other currencies**, each with its own rate
  ("LBP per $1", "USD per €1"), all in Settings. New accounts start as USD + LBP at
  89,500. Entries are typed in any of them (tap the code next to the amount to switch)
  and stored normalized to **integer hundredths of the main currency**, with the original
  currency/amount/rate kept for auditable export.
- **Auth:** Supabase **Google sign-in** (plus a hidden email + password for friends
  without Google). No emails sent. Data is isolated per-account via Row Level Security.
- **Privacy:** the money **values** (amounts, gold grams, notes) are stored encrypted
  (AES-GCM), each in its own `_enc` column; labels like category and date stay plaintext.
  By default the key is wrapped with a public constant — so it's operator-readable, the same
  as plain storage — but any user can turn on **end-to-end encryption** in Settings with a
  passphrase, after which *no one but them* (not even whoever runs the server) can read their
  amounts or notes — with one exception they opt into per purchase, a **spending review**, which
  sends that period's finished totals (never notes, never rows) through the review function to the
  model. See **Encryption** and **Spending reviews** below.
- **Export:** CSV or PDF, for this month, last month, the past 3 months, or all time.
  Generated client-side from the decrypted rows, so it works on encrypted data.
- **Spending review (paid, $5 once per review):** an AI-written read-back of a logged
  month — or three — for accounts with enough history. The figures are totalled on the
  device and the model only writes prose over them, so a review can be dull but cannot
  invent a number. Kept in an archive behind its own passphrase. See **Spending reviews**
  below.
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

> _An earlier build created a `safe_entries` table that's no longer used; it's empty and
> ignored, and `0008_drop_legacy.sql` below removes it._

Then run [`0003_e2e.sql`](supabase/migrations/0003_e2e.sql) (the `e2e_keys` vault + the
encrypted `_enc` value columns on `transactions`) and
[`0004_e2e_gold.sql`](supabase/migrations/0004_e2e_gold.sql) (the same for the gold ledger).
Then run [`0005_drop_plaintext_values.sql`](supabase/migrations/0005_drop_plaintext_values.sql)
to drop the now-unused plaintext columns. It's guarded — it refuses to run while any row
still has an unencrypted value, so on a fresh database (nothing to migrate) it's safe to
apply straight through.

Then [`0006_public_stats.sql`](supabase/migrations/0006_public_stats.sql) (the community
numbers on the Stats page) and
[`0007_currencies.sql`](supabase/migrations/0007_currencies.sql), which adds the
per-user main currency and currency list, carries each user's existing LBP rate across,
and lets `rate_used` hold fractions (0.92 EUR per $1). Everyone already on the app stays
on USD with nothing to do. Run it before deploying the app: the app reads only the new
columns, so until the migration is in every account shows the defaults (USD + LBP at
89,500) and the currency card in Settings shows the database's error.

Then [`0008_drop_legacy.sql`](supabase/migrations/0008_drop_legacy.sql) drops what
nothing reads any more: the old single-rate `profiles.lbp_per_usd` column (0007 copied it
into the currency list) and the leftover `safe_entries` table. Run it after 0007, once the
app that came with 0007 is deployed.

Finally [`0009_spending_reviews.sql`](supabase/migrations/0009_spending_reviews.sql) adds
the paid spending review: the `spending_reviews` rows, the `review_access` archive
passphrase, the `stripe_events` idempotency ledger, and the `report_eligibility()`
function that decides who may buy one. Until it is applied the review screen shows the
database's own error instead of a purchase button, and nothing else in the app notices.

> **Changing the main currency** doesn't convert what's already saved: the stored
> numbers stay as they are and are simply read in the new currency (a fresh account
> won't notice; one with history gets a confirmation first). The rates for the other
> currencies are re-based when the new main was one of them, otherwise cleared to set up
> again. The Safe's live gold price is quoted in USD, so with another main currency it
> only shows once USD is in the list with a rate.
>
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

  > **The one exception, and it is opt-in per use:** buying a **spending review** sends that
  > period's *finished figures* — per-category and per-month totals, counts, day coverage, the
  > biggest few expenses, repeated charges — through the review function to Anthropic's Claude,
  > which writes the prose. Notes are never sent, individual rows are never sent, and nothing
  > outside the chosen period is sent. The purchase screen states this before the button, and
  > nobody who does not buy a review is affected. The review that comes back is encrypted with
  > the same master key before it is stored, so it is at rest under your passphrase like
  > everything else. See **Spending reviews (paid)** below.
- **Stored on the device, shown in Settings.** The passphrase is cached in this browser, so
  the app stays unlocked across restarts and you can see/change it in the Encryption card. It
  **never leaves the device** — the server still can't read it. A brand-new device (or one
  where the passphrase was changed elsewhere) starts **locked**: amounts render *obscured*
  (a garbled stand-in) until you enter the passphrase once, then it's cached there too.
- **No recovery, by design.** There is deliberately no reset: if a user forgets their
  passphrase and has no device that still has it cached, the data is unrecoverable — that's
  the proof it's truly end-to-end.
- **Scope — only the money *values*.** We encrypt what actually matters: `amount_usd_cents`
  (the amount in the main currency — the column kept its name from when USD was the only
  option), `original_amount` and `note` on transactions, and `grams` + `note` on gold. Each
  goes into its own `_enc` column. The **labels** (category, direction, currency, rate,
  date) and the currency settings on the profile stay as plaintext columns — useful, and
  not the secret. So the operator can see *"an Out in groceries on June 1"* but not the
  amount.

## Spending reviews (paid)

One optional purchase: **$5 for one review** of a finished month, or of the three months
ending with it. No subscription, and nothing that already worked is behind it.

**Who can buy one.** Enforced in the database by `report_eligibility()`, not in the
browser, so the rule holds even with devtools open — and so it can count every row the
account has rather than the 500 the app keeps in memory:

- at least **40 logged expenses** inside the window (income and Safe transfers don't count), and
- **history that reaches back to the start of the window** — a month of logging behind you.

A window with a lot of unlogged days is a **warning, not a refusal**: a thin month is still
the customer's call to buy, and the review is told to say so in its own text. Eligibility
needs only counts and dates, which is lucky — the amounts are encrypted per-column and the
server genuinely cannot read them.

**What happens, in order.**

1. The browser asks `report_eligibility()` where the account stands and shows it.
2. Buying calls the **`review-checkout`** function, which re-checks eligibility itself,
   writes a `pending` row owning the price and the window, and returns a Stripe Checkout
   URL. The app navigates to it — a plain redirect, so no third-party script ever runs in
   the app and the Content-Security-Policy needs no new entry.
3. Stripe calls **`stripe-webhook`**, which verifies the signature, records the event id so
   a retry can't pay twice, and flips the row to `paid`. **This is the only way a review
   becomes paid** — the browser is never believed about money.
4. Back in the app, the device reads the window's rows, decrypts them, and totals
   everything itself (`src/lib/reportDigest.ts`).
5. **`generate-review`** checks the row is paid, then has Claude write prose over those
   finished figures, and returns it. Nothing is stored server-side.
6. The device encrypts the review with the account's own master key and writes it to
   `body_enc` — the one column the browser is allowed to write.

**What leaves the device, exactly.** The digest: per-category and per-month totals, counts,
day coverage, weekday split, the biggest few expenses, repeated charges, and
month-over-month changes — each amount accompanied by the string the app would print.
**Notes are never sent** (they name people and merchants, and add nothing to a spending
pattern), nothing outside the chosen window is sent, and no time-of-day is sent (entries are
stamped when they are *logged*, so an hour histogram would describe phone habits while
sounding like it described spending). The purchase screen says all of this before the button.

**Why the numbers can be trusted.** The model is given finished figures and told to copy
them verbatim, and then — because instructions are not a guarantee — every money-shaped
token in what it writes is checked against the digest before the review is accepted. A
review quoting an amount the digest doesn't contain is thrown away rather than shown, and
the purchase keeps its remaining attempts. Reviews are also structured JSON rendered by the
app's own components, so there is no markup to sanitise.

**It is a review, not advice.** The prompt forbids recommending investments, products,
loans, tax positions or budgets, forbids guessing at the reader's income or circumstances,
and requires it to name its own blind spots. The screen says so too.

**The archive passphrase.** Set before the first purchase and held as an unreadable token in
`review_access`, so past reviews stay reachable and not just the newest one. Be clear about
what it is: it **locks the archive screen** — it is never stored or sent, and unlike the
encryption passphrase it is deliberately *not* cached on the device, so a borrowed unlocked
phone doesn't come with your reviews open. It is **not** a second layer of encryption: a
review's body is encrypted with the same master key as every amount in the account, so its
confidentiality is exactly that of your tier (operator-readable by default, end-to-end once
you turn on a personal passphrase — see **Encryption** above). Protecting the summary more
strongly than the numbers it is drawn from would be a boundary worth nothing. Forgetting it
loses nothing: set a new one from any unlocked device.

**If something goes wrong after paying.** A generation may be retried three times while no
body has been stored, so a dropped response costs nothing. After that the row goes `failed`
with the reason, which is the owner's cue to refund — the standing policy is refunds
instantly, no questions, within 30 days.

A **full** refund (or an opened dispute) marks the row `refunded` and clears the review body, so
the review goes with the money rather than staying readable in the archive. A partial refund
deliberately does not. An opened dispute locks the row straight away because the money is at
risk; if it is later resolved in your favour, move it back by hand in the Supabase table editor —
set `status` to `ready` — remembering that the body is gone, so the customer will need a fresh
generation (`attempts` may need lowering too).

### Setting it up

Three Edge Functions (Supabase Dashboard → **Edge Functions → Deploy a new function → Via
Editor**; name each one exactly as below and paste the file). `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

| Function | Verify JWT | Purpose |
|---|---|---|
| [`review-checkout`](supabase/functions/review-checkout/index.ts) | **on** | Gate + create the Stripe Checkout Session |
| [`stripe-webhook`](supabase/functions/stripe-webhook/index.ts) | **OFF** | The only writer of `paid` |
| [`generate-review`](supabase/functions/generate-review/index.ts) | **on** | Have Claude write it |

> `stripe-webhook` **must** have "Verify JWT" turned off — Stripe sends its own signature,
> not a Supabase token, so every delivery would 401 with it on. Via CLI that is
> `supabase functions deploy stripe-webhook --no-verify-jwt`.

Secrets (Dashboard → **Edge Functions → Secrets**). None of these ever reach the browser —
note that anything named `VITE_*` or `NEXT_PUBLIC_*` **would**, so they do not go in Vercel:

| Secret | Where to find it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → **API keys → Secret key** |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint → **Signing secret** |
| `ANTHROPIC_API_KEY` | console.anthropic.com → **API keys** |
| `APP_URL` | Where the app is served, e.g. `https://bucksbuddy.com` (no trailing slash) |
| `REVIEW_PRICE_CENTS` | *Optional*, defaults to `500`. Change it and change `REVIEW_PRICE_CENTS` in [`src/lib/reviews.ts`](src/lib/reviews.ts) too, or the advertised price and the charge disagree. A review already bought always shows the price it was actually charged. |

In Stripe → Developers → **Webhooks → Add endpoint**, point it at
`https://<project-ref>.supabase.co/functions/v1/stripe-webhook` and subscribe to
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `charge.refunded` and `charge.dispute.created`.

> **Test mode first.** With Stripe's test keys and test webhook secret the whole flow runs
> end to end on card `4242 4242 4242 4242`. Swapping to live keys means swapping the webhook
> secret too — a live signature will not verify against a test secret, so payments would
> land and reviews would stay `pending`.

> **Stripe does not reach everyone.** Most of the app's current users are in Lebanon, where
> Stripe cannot charge them. For them this button is decoration until another rail is wired
> up; the review screen still shows them where they stand against the bar.

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

**Edge Functions** are Deno, with remote imports and a top-level `Deno.serve`, so they
sit outside the Vitest project and the coverage gate. The two pieces where a silent
regression would actually cost something get their own checks, run in CI alongside the
suite:

```bash
npm run verify:functions
```

It lifts the `#region verifiable` block out of each function — the same source that gets
deployed, imported through Node's type stripping, so there is no second copy to drift —
and exercises the **Stripe webhook signature check** (genuine signatures, wrong secrets,
tampered payloads, replays outside the tolerance, secret rotation, malformed headers) and
the **no-invented-amounts guard** (every money-shaped token in a generated review has to
appear in the digest the device computed).

## Install on iPhone

Open the deployed URL in **Safari → Share → Add to Home Screen**. It launches standalone.
Sign-in is email + password (no email link), so you stay inside the app the whole time.

## Project layout

```
index.html              app entry
src/main.tsx            mount + register service worker
src/App.tsx             auth gate + hash router
src/screens/            Login, Home, Add, Settings, Review
src/components/          AddComposer + ui/* building blocks, history rows/stacks, CurrencySettings, ExportCard
src/lib/                supabase client, store (in-memory cache), router, useSession,
                        crypto + e2e (encryption vault), currency/money/dates/csv/categories,
                        reportPeriod/reportEligibility/reportDigest/reportVault/reviews
                        (the paid spending review)
src/types/db.ts         row types
vite.config.ts          Vite + PWA (manifest, service worker; Supabase calls never cached)
supabase/migrations/    0001_init.sql … 0007_currencies.sql, 0008_drop_legacy.sql,
                        0009_spending_reviews.sql
supabase/functions/     delete-account, review-checkout, stripe-webhook, generate-review
docs/DESIGN_SYSTEM.md   reusable design system
```

> A React Native port lived in `mobile/` for a few days in September 2026 and was
> removed to keep one codebase. It is archived, with its porting notes and
> store-launch checklist, at commit `f374605` (tag `mobile-archive-0.1.1`).
