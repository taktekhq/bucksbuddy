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
  amounts or notes — with one exception they opt into per review, a **spending review**, which
  sends that period's finished totals (never notes, never rows) through the review function to the
  model. See **Encryption** and **Spending reviews** below.
- **Export:** CSV or PDF, for this month, last month, the past 3 months, or all time.
  Generated client-side from the decrypted rows, so it works on encrypted data.
- **Spending review (in testing — free, and only for allowlisted accounts):** an AI-written
  read-back of a logged month — or three — for accounts with enough history. The figures are
  totalled on the device and the model only writes prose over them, so a review can be dull
  but cannot invent a number. Kept in an archive, behind the same passphrase as everything
  else. The $5 Stripe
  purchase it is meant to become is written and tested but **not deployed**. See **Spending
  reviews** below.
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
the spending review: the `spending_reviews` rows, the `stripe_events` idempotency ledger,
and the `report_eligibility()` function that decides who may have one. Until it is applied
the review screen shows the database's own error instead of a button, and nothing else in
the app notices.

Then [`0010_drop_review_access.sql`](supabase/migrations/0010_drop_review_access.sql), which
drops a table an earlier copy of 0009 created: `review_access`, holding a second passphrase
for the archive. There is only one passphrase now (see **The archive lock** below), so the
table is gone. On a database that never had it, this is a no-op.

Finally [`0011_review_periods.sql`](supabase/migrations/0011_review_periods.sql): the three
review windows, two of which include the current month. It widens the `period_id` check (the
superseded ids stay legal, so a stored review is never orphaned) and teaches
`report_eligibility()` that a **null** window start means "from this account's first entry",
which is what "all time" needs. Re-runnable, and required before a review can be asked for.

> **If you ran an earlier copy of 0009** — one whose `price_cents` check read `> 0` — a
> free review cannot be written, because a free grant is priced at zero. Either re-run
> 0009 on a database with no reviews yet, or widen the constraint in place:
>
> ```sql
> alter table spending_reviews drop constraint spending_reviews_price_cents_check;
> alter table spending_reviews add constraint spending_reviews_price_cents_check
>   check (price_cents >= 0);
> ```

> **Changing the main currency** doesn't convert what's already saved: the stored
> numbers stay as they are and are simply read in the new currency (a fresh account
> won't notice; one with history gets a confirmation first). The rates for the other
> currencies are re-based when the new main was one of them, otherwise cleared to set up
> again. The Safe's live gold price is quoted in USD, so with another main currency it
> only shows once USD is in the list with a rate.
>
> **Savings Safe:** a vault icon next to Settings opens a dark "Safe" screen (available
> to everyone). A sparkles icon beside it opens the **spending review** (see below).
> - **Cash** moved to the safe is recorded as a normal transaction with the `safe`
>   category — so it leaves your spendable balance (Out) and shows in history; taking it
>   back is an In. The safe's cash total is the all-time net of those transactions.
> - **Gold** is tracked separately in **grams** (`safe_gold_entries`); it isn't converted,
>   though the screen shows an approximate USD value from a free live price API when
>   reachable.
>
> **Subcategories:** categories with a small dot (Health → Pharmacy, Fees → Mobile,
> Food/Groceries/Coffee, Work → Subscriptions/Domains/Hardware/Credits/Services, …) open a
> second step to pick a finer label. Stored inline as
> `parent/sub` in the existing `category` field — no schema change, existing rows
> untouched.

> **Recurring payments (proof of concept):** **Recurring**, next to *Show all* on
> Home, opens `#/recurring` — the subscriptions, rent, salary and other entries that
> keep coming back for the signed-in user, with what they add up to and when each is next
> due. A Monthly / Yearly switch (remembered) separates what comes round within a month,
> totalled per month, from the yearly renewals, totalled per year; within each side the
> series sit under their category, like History's stacks, with a subtotal per category. Nothing is set up by hand and there is no schema change:
> `src/lib/recurring.ts` finds the series in the entries already logged, on the
> device (so it works on end-to-end encrypted data), scoped to the signed-in user id.
> The rules are forgiving, because entries are typed by hand: entries in the same
> direction + category whose notes *mean* the same thing (at least half their words
> shared, typos allowed — `src/lib/notes.ts`; one word out of many is not enough), spaced
> weekly / every two weeks / monthly / yearly with a couple of days' slack and one skipped
> log allowed — two entries for monthly and yearly, three for the short cadences; entries
> a day or two apart count as one. A note can also say so outright: "(yearly)" counts from
> its first entry, "subscription" or "membership" marks it recurring and lets the dates say
> how often (monthly until they can), a domain name ("sillyguy.com", or the word "domain")
> is yearly, and "(ended)" on the last entry stops it. Every one of those words is dropped
> from the name before comparing. Who it was "with" is dropped too, so "dinner with Sara"
> and "lunch with Sara" don't merge on her name. A series that stops, stops showing: a
> whole period past its due date with nothing logged and it's gone; logged again within
> that time it carries on, and after a longer break the new entries start over as a series
> of their own. Amounts are compared to the price before them: within 10% is the same
> price, a bigger jump (up to 50%) is a price change and keeps the series once the old
> price had held for two entries; an entry that fits neither is left out as an odd one
> out (a bottle of water logged next to the gym fee), as long as those stay a minority.
> When the note vouched for the series the amounts are taken as they come. The page shows
> the new price with the old one underneath. To keep notes from drifting, the composer offers the past
> notes of the chosen category (the exact one) as chips under the note field, and a
> tiny info button next to the note opens the cheat codes worth teaching: the cadence words and
> "(ended)" ("subscription" and "membership" still work but aren't advertised). The page is read-only; it
> sits behind the same unlock nudge as the rest of the app when the device is locked.

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

  > **The one exception, and it is opt-in per use:** asking for a **spending review** sends that
  > period's *finished figures* — per-category and per-month totals, counts, day coverage, the
  > biggest few expenses, repeated charges — through the review function to Google's Gemini,
  > which writes the prose. Notes are never sent, individual rows are never sent, and nothing
  > outside the chosen period is sent. The review screen states this before the button, and
  > nobody who does not ask for a review is affected. The review that comes back is encrypted
  > with the same master key before it is stored, so it is at rest under your passphrase like
  > everything else. See **Spending reviews** below.
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

## Spending reviews

One optional extra: a written review of what you have logged. Nothing that already
worked is behind it.

**Where it is.** A sparkles icon in Home's nav bar, left of the Safe and Settings icons,
opens the review screen (`#/review`) — its own dark violet room, distinct from the Safe's
green vault (see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)). It shows for every
signed-in account, including ones that cannot have a review yet: the screen's other job is
to say where an account stands against the bar, and that is the only way anyone finds out.

**The three windows.** Two of them include the current, unfinished month, because "how is
this month going" is the question a window that stops on the 1st cannot answer.

| Window | Covers | Stored as |
|---|---|---|
| This month vs last | The 1st of last month → now | `this_vs_last` |
| Past 3 months | The 1st of the month two back → now | `last_3_months` |
| All time | The account's first entry → now | `all_time` |

That makes a review a **snapshot, not a finished document**: asking again tomorrow covers a
day more. Each review stores the window it was written for, so the archive labels it with
that window rather than with today's — *"This month vs last · August 2026 – September
2026"*. The two superseded windows (`last_month`, `past_3_months`, both whole finished
months) stay readable; nothing offers them.

Because a window can end mid-month, every per-month figure carries how many of that month's
days are **inside** the window, and the month-over-month comparison is computed on the
**daily rate** rather than the totals. Otherwise, spending at exactly last month's rate
would read as "down 50%" on the 15th — and the model is told to copy these figures
verbatim, so that would have been handed over as a fact.

**Free, and allowlisted, while it is being tried out.** The `REVIEW_ALLOWLIST` secret on
the `review-start` function names the accounts that may have one, by email or by auth user
id, and an account not on that list is refused with *"Spending reviews aren't open yet."*
An empty or unset allowlist allows nobody. A grant made this way is written into
`spending_reviews` already `paid`, at `price_cents = 0`, and the app never touches Stripe:
the review is written where the customer is standing. The intended **$5 per review**
purchase is implemented and tested in the same function — see **Turning the $5 purchase on**
below — but deploying the function without Stripe keys sells nothing, by design.

**Who can have one.** Enforced in the database by `report_eligibility()`, not in the
browser, so the rule holds even with devtools open — and so it can count every row the
account has rather than the 500 the app keeps in memory:

- at least **40 logged expenses** inside the window (income and Safe transfers don't count), and
- **history that reaches back to the start of the window** — logging that was already going
  when the window opened. All time is exempt: it *starts* at the first entry, so it covers
  itself by construction.

A window with a lot of unlogged days is a **warning, not a refusal**: a thin month is still
the customer's call, and the review is told to say so in its own text. (Not for all time,
where the denominator is the account's whole life — an account that logged diligently for
four months but opened two years ago is not "thin".) Eligibility needs only counts and
dates, which is lucky — the amounts are encrypted per-column and the server genuinely
cannot read them.

Asking for all time sends a **null** window start, and the database resolves it to the first
entry (migration 0011): only it knows when that was, and a floor date guessed in the browser
would measure coverage against decades the account did not exist for. `review-start` then
checks the window the browser claims really does start there.

**What happens, in order.**

1. The browser asks `report_eligibility()` where the account stands and shows it.
2. Asking for one calls the **`review-start`** function, which re-checks eligibility itself
   and then decides the route. **Allowlisted:** it writes a `paid` row at a price of zero and
   returns its id. **Not allowlisted, Stripe configured:** it writes a `pending` row owning
   the price and the window and returns a Stripe Checkout URL, which the app navigates to — a
   plain redirect, so no third-party script ever runs in the app and the
   Content-Security-Policy needs no new entry. **Neither:** a plain refusal.
3. *(Purchases only.)* Stripe calls **`stripe-webhook`**, which verifies the signature,
   records the event id so a retry can't pay twice, and flips the row to `paid`. **That is
   the only way a review a customer paid for becomes paid** — the browser is never believed
   about money. A free grant never goes near it.
4. The device reads the window's rows, decrypts them, and totals everything itself
   (`src/lib/reportDigest.ts`).
5. **`generate-review`** checks the row is paid, then has Gemini write prose over those
   finished figures, and returns it. Nothing is stored server-side.
6. The device encrypts the review with the account's own master key and writes it to
   `body_enc` — the one column the browser is allowed to write.

**What leaves the device, exactly.** The digest: per-category and per-month totals, counts,
day coverage, weekday split, the biggest few expenses, repeated charges, and
month-over-month changes — each amount accompanied by the string the app would print.
**Notes are never sent** (they name people and merchants, and add nothing to a spending
pattern), nothing outside the chosen window is sent, and no time-of-day is sent (entries are
stamped when they are *logged*, so an hour histogram would describe phone habits while
sounding like it described spending). The review screen says all of this before the button.

**Why the numbers can be trusted.** The model is given finished figures and told to copy
them verbatim, and then — because instructions are not a guarantee — every money-shaped
token in what it writes is checked against the digest before the review is accepted. A
review quoting an amount the digest doesn't contain is thrown away rather than shown, and
the row keeps its remaining attempts. Reviews are also structured JSON rendered by the
app's own components, so there is no markup to sanitise.

**It is a review, not advice.** The prompt forbids recommending investments, products,
loans, tax positions or budgets, forbids guessing at the reader's income or circumstances,
and requires it to name its own blind spots. The screen says so too.

**The archive lock.** Reviews are kept, so a second and a tenth one can be read later and
not just the newest. Opening a past one is gated by **the passphrase the account already
has** — there is no second passphrase to set, and no row in the database holding one:

- **End-to-end tier:** the archive asks for your encryption passphrase once each time you
  open the app, checked on the device against the one it unlocked with. That is the borrowed-
  phone case: an unlocked phone in someone else's hand does not come with your reviews open.
- **Default tier:** nothing is asked. The only passphrase a default-tier account has is the
  constant compiled into the bundle, and a lock whose key is published is not a lock — it
  would have been a dialog, not a boundary.

Either way this is **not** a second layer of encryption. A review's body is encrypted with
the same master key as every amount in the account, so its confidentiality is exactly that of
your tier (operator-readable by default, end-to-end once you turn on a personal passphrase —
see **Encryption** above). Protecting the summary more strongly than the numbers it is drawn
from would be a boundary worth nothing, and asking for a passphrase nobody chose would have
been theatre.

**If a generation fails.** It may be retried three times while no body has been stored, so a
dropped response costs nothing. After that the row goes `failed` with the reason — which,
once reviews are sold, is the owner's cue to refund; the standing policy is refunds
instantly, no questions, within 30 days.

A **full** refund (or an opened dispute) marks the row `refunded` and clears the review body, so
the review goes with the money rather than staying readable in the archive. A partial refund
deliberately does not. An opened dispute locks the row straight away because the money is at
risk; if it is later resolved in your favour, move it back by hand in the Supabase table editor —
set `status` to `ready` — remembering that the body is gone, so the customer will need a fresh
generation (`attempts` may need lowering too).

### Setting it up (free, allowlisted — what is deployed today)

Migrations first: `0009`, then `0010`, then `0011` (see **Run the database migration**
above). A review cannot be asked for until 0011 is applied — the window ids it stores are
refused by 0009's check constraint, and "all time" needs 0011's null-anchored eligibility.

Two Edge Functions (Supabase Dashboard → **Edge Functions → Deploy a new function → Via
Editor**; name each one exactly as below and paste the file). `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

| Function | Verify JWT | Purpose |
|---|---|---|
| [`review-start`](supabase/functions/review-start/index.ts) | **on** | Gate, then grant it free or sell it |
| [`generate-review`](supabase/functions/generate-review/index.ts) | **on** | Have Gemini write it |

Secrets (Dashboard → **Edge Functions → Secrets**). None of these ever reach the browser —
note that anything named `VITE_*` or `NEXT_PUBLIC_*` **would**, so they do not go in Vercel:

| Secret | Where to find it |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) → **Get API key** |
| `REVIEW_ALLOWLIST` | You write it: the emails and/or auth user ids that may have a review, comma-separated (`me@example.com,you@example.com`). Unset or empty allows **nobody**, which is what makes deploying the function safe. |
| `GEMINI_MODEL` | *Optional.* An id to **try first**. Leave it unset and the function walks its own list — `gemini-flash-latest`, then `gemini-3.5-flash`, then `gemini-2.5-flash` — and stops at the first one your key can call, recording it in the review's `model` column so you can see which won. Set this only to override that order, e.g. to a Pro id (note: Pro ids generally need billing on the Cloud project, while Flash and Flash-Lite are the free-tier ones). Google retires ids and closes older ones to keys created after a cutoff, which is why none of them is hardcoded as the answer. |

That is the whole of it. `REVIEW_PRICE_CENTS`, `APP_URL` and the Stripe secrets are unset,
so `review-start` has no way to charge anybody and refuses every account that is not on the
allowlist. Nothing in the app advertises a price: `REVIEW_BILLING` in
[`src/lib/reviews.ts`](src/lib/reviews.ts) is `"off"`, which is what puts *"Write my review"*
on the button instead of *"Unlock a review · $5.00"*. It governs **copy only** — the server
is the only authority on who gets one.

### Turning the $5 purchase on (later)

The paid route lives in the same `review-start` function and is exercised by the test
suite; switching it on is configuration, not code:

1. Deploy the third function, **[`stripe-webhook`](supabase/functions/stripe-webhook/index.ts)**,
   with **Verify JWT OFF**. Stripe sends its own signature, not a Supabase token, so every
   delivery would 401 with it on. Via CLI that is
   `supabase functions deploy stripe-webhook --no-verify-jwt`. It is the only writer of
   `paid` for a purchase.
2. Add the secrets that make charging possible:

   | Secret | Where to find it |
   |---|---|
   | `STRIPE_SECRET_KEY` | Stripe → Developers → **API keys → Secret key** |
   | `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint → **Signing secret** |
   | `APP_URL` | Where the app is served, e.g. `https://bucksbuddy.com` (no trailing slash) |
   | `REVIEW_PRICE_CENTS` | *Optional*, defaults to `500`. Change it and change `REVIEW_PRICE_CENTS` in [`src/lib/reviews.ts`](src/lib/reviews.ts) too, or the advertised price and the charge disagree. A review already bought always shows the price it was actually charged. |

3. In Stripe → Developers → **Webhooks → Add endpoint**, point it at
   `https://<project-ref>.supabase.co/functions/v1/stripe-webhook` and subscribe to
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `charge.refunded` and `charge.dispute.created`.
4. Set `REVIEW_BILLING` to `"stripe"` in [`src/lib/reviews.ts`](src/lib/reviews.ts) and
   deploy the app, so the button advertises the price.
5. Widen or clear `REVIEW_ALLOWLIST`. Whoever stays on it keeps getting reviews for free —
   that is the intended way to keep the owner's own account off the card rail.

> **Test mode first.** With Stripe's test keys and test webhook secret the whole flow runs
> end to end on card `4242 4242 4242 4242`. Swapping to live keys means swapping the webhook
> secret too — a live signature will not verify against a test secret, so payments would
> land and reviews would stay `pending`.

> **Stripe does not reach everyone.** Most of the app's current users are in Lebanon, where
> Stripe cannot charge them. For them this button would be decoration until another rail is
> wired up; the review screen still shows them where they stand against the bar.

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
src/screens/            Landing, Home, History, Recurring, Review, Stats, Safe, Settings, …
src/components/          AddComposer + ui/* building blocks, history rows/stacks, CurrencySettings, ExportCard
src/lib/                supabase client, store (in-memory cache), router, useSession,
                        crypto + e2e (encryption vault), currency/money/dates/csv/categories,
                        stats + recurring + notes (pure aggregations over the decrypted rows),
                        reportPeriod/reportEligibility/reportDigest/reviews
                        (the spending review), pagedRead (read every page or null)
src/types/db.ts         row types
vite.config.ts          Vite + PWA (manifest, service worker; Supabase calls never cached)
supabase/migrations/    0001_init.sql … 0007_currencies.sql, 0008_drop_legacy.sql,
                        0009_spending_reviews.sql, 0010_drop_review_access.sql,
                        0011_review_periods.sql
supabase/functions/     delete-account, review-start, stripe-webhook, generate-review
docs/DESIGN_SYSTEM.md   reusable design system
```

> A React Native port lived in `mobile/` for a few days in September 2026 and was
> removed to keep one codebase. It is archived, with its porting notes and
> store-launch checklist, at commit `f374605` (tag `mobile-archive-0.1.1`).
