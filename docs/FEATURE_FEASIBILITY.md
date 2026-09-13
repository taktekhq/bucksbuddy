# Goals, Recurring payments, MCP — what's possible under the encryption

Three features were on the table. The worry was that end-to-end encryption makes them
impossible, and that it wasn't clear what any of them should even look like.

The encryption turns out to be the smaller problem. Two of the three are comfortably
buildable and one of them barely touches the encryption at all. The real constraints are
somewhere else: **what the product data actually says**, and **where an assistant can be
set up from**.

Short version:

| | Encryption says | Verdict | Do it? |
|---|---|---|---|
| **Goals** | Fine — nothing needs server arithmetic | Buildable, a few days | **Yes** — but as a monthly spending limit, not a Safe savings target |
| **Recurring (inferred)** | Fine — the cleanest of the three | Buildable, but **no data to run on** | **Not yet.** Nothing would fire for anyone today |
| **MCP** | The honest remote version breaks the promise | Real server is a big build with a bad setup story | **A cut-down version now**, full connector later |

---

## 1. The constraint, stated precisely

Per-user AES-GCM-256 master key, wrapped either under a public constant (`"bubbles"`,
default tier — operator-readable) or under PBKDF2(passphrase, 600k) (passphrase tier —
operator locked out). See `src/lib/crypto.ts`, `src/lib/e2e.ts`.

Only money **values** are ciphertext:

- ciphertext: `amount_usd_cents_enc`, `original_amount_enc`, `note_enc`, `grams_enc`
- plaintext: `is_income`, `category` (possibly `parent/sub`), `original_currency`,
  `rate_used`, `occurred_at`, `created_at`, `user_id`, and the whole currency profile

So the rule for every feature idea is one line:

> **Postgres can never compare, sum, sort or threshold a money value.**
> Anything money-shaped must be computed in the browser, over the already-decrypted
> `transactions` array the store holds in memory.

That sounds crippling and mostly isn't, because **the app already computes everything on
render**. `topCategories`, `monthInsights` (including `forecastCents`, a month-end
projection at current pace), `monthlySpendTotals`, `dailySpendSeries`, `safeTotalCents`
are all pure functions over decrypted rows. A feature that only needs arithmetic when a
screen is open costs nothing. A feature that needs the *server* to notice something is
the one that's in trouble.

### The trap every one of these features can fall into

A locked device does not fail loudly — `maskedTransaction` (`src/lib/store.tsx:161`)
hands back `amount_usd_cents: 0`, `original_amount: 0`, `note: null`. Run any aggregate
over those and you get a confident, well-formatted zero. A budget would say "you're doing
great." A briefing would tell an LLM you spent nothing all month.

And `locked` alone is not the test — `unlock()` clears it *before* awaiting the reload.
The codebase already worked this out once; use the same compound test
(`src/components/ExportCard.tsx:63-68`):

```ts
const masked = locked || transactions.some((t) => t.amountMask != null);
```

Better still, make the pure function itself return `null` (not `[]`) when any row is
masked, so a future caller can't forget.

---

## 2. What the usage data says

This is the part that changes the recommendations, so it goes before them. All figures
from PostHog project 221633, instrumented since 2026-07-11, checked 2026-09-13.

**Scale.** 220 `transaction_added` events, 12 people, 104 sign-ins.

**Retention is the actual problem.** 9 of 12 people logged everything they ever logged
inside a 10-day window in July and never came back. Three people are still going.

| Month | Entries | People |
|---|---|---|
| Jul 2026 | 183 | 9 |
| Aug 2026 | **0** | **0** |
| Sep 2026 | 37 | 6 |

**The heaviest user** has 61 entries across 60 days — 14 active days. That's ~1/day at
peak, not 4/day.

**The Safe is not in use.** `safe_cash_deposited` is 6 events from 3 people, all inside
two 2-second bursts on Sep 5 and Sep 6 — each person's entire history is 2-3 events
within the same second, alongside a gold deposit *and* withdrawal in the same second.
That is test traffic, not usage. The only plausibly genuine Safe event in two months is a
single withdrawal on 2026-07-18.

**What people actually log** is everyday variable spending:

```
gas 21 · other 17 · food/delivery 13 · food/snacks 13 · parking 11 · food 10
shopping/clothes 10 · groceries/supermarket 9 · family 8 · food/restaurant 8
```

And what they *don't* log is exactly the recurring stuff: **rent: 0 entries.
fees/subscriptions: 0. fees/mobile: 3 (2 people). salary: 3 (2 people).**

Two conclusions follow directly, and they're not about cryptography:

1. **A savings goal attached to the Safe has no audience.** Nobody uses the Safe.
2. **A recurring-payment detector has nothing to detect.** It needs 3+ occurrences of a
   monthly series. The app's entire history is two months with a hole in the middle, and
   the categories a detector would live on are empty.

> None of these three features addresses why 9 of 12 people stopped within ten days. That
> is worth saying plainly, and it's a separate question from the one asked here. The rest
> of this document answers the question as asked.

---

## 3. Goals

### Verdict: buildable, no encryption compromise. Build a monthly limit, not a savings target.

**The encryption is a non-issue.** A goal target is one number the user typed. Store it
as ciphertext like any other money value; compute progress in the browser from rows
already in memory. The server never compares anything. Passphrase-tier and default-tier
users get identical behaviour. Turning encryption on or off doesn't touch it — those
operations only re-wrap the master key, they never re-encrypt data (`src/lib/e2e.ts:186`).

**The shape is the real question, and the data answers it.**

The instinct is a savings goal on the Safe — "£2,000 by December" — because progress is
then a *fact* (money you actually moved) rather than a promise. It's a lovely idea and
nobody would see it. Nobody uses the Safe. It also inherits a bug: `safeTotalCents` is an
all-time reduce over a 500-row window, so progress silently understates once history
exceeds the cap. And `Stats` already ships a "Safe runway" line, so it partly duplicates
existing surface.

The other instinct is to reject budgets because "they need server-side thresholds and
alerts we can't do." **That premise is false.** Nothing in this app does thresholds
server-side, and a budget doesn't need to: `spent > limit` and `forecast > limit`
evaluated at render is the whole feature, and both numbers already exist
(`topCategories` returns per-category totals and share; `monthInsights.forecastCents` is
already rendered on Stats as "On pace for"). `monthlySpendTotals` gives six months of
history to propose a sane default limit. A monthly limit only ever reads the current
month — always inside the fetch cap. It is *cheaper* than the savings goal, not dearer.

And it sits on gas, food, groceries, parking, shopping — where the entries actually are.

### The recommended shape — "Lines"

> A Line is a monthly cap you draw on a category (or on everything), and the app tells
> you where you stand the moment you log an expense.

- **Settings → Lines.** Pick a category via the existing `CategorySheet`, type an amount
  with the existing tinted-currency composer row. No deadline, no wizard, no date picker —
  a Line is always "this calendar month, every month."
- **Home**, under the hero, one inset row beside "In the safe": `Coffee 38 left ·
  Everything 240 left`, showing the two tightest.
- **The moment that matters — the composer.** Pick Coffee, type 6.50, and one line under
  the CTA reads `Coffee: 38 left → 31.50`. Commit and it becomes `31.50 left this month`.
  Cross it and the same line turns red: `That's over by 6, Doc.`

No toast, no modal, no notification. The app only speaks when you're already holding it —
which is also the only thing the architecture can honestly do.

### Storage — one encrypted blob, not a table

Add **one nullable column**, `profiles.lines_enc text`. Inside it, a JSON list
`[{id, cat, cents, cur, at}]`, padded to a fixed size before encrypting.

The alternative — a `goals` table with plaintext `category` and an encrypted
`target_cents_enc` — is what "follow the `safe_gold_entries` pattern" would produce, and
it quietly hands the operator a per-user timeline: *created a coffee goal Jan 2, deleted
it Jan 19, has 4 active goals, budgets groceries and rent.* **A row's existence is not a
column — you cannot encrypt it away.** Config belongs in one opaque blob.

Three details worth taking:

- **Pad before encrypting.** AES-GCM ciphertext is plaintext + 16 bytes with no padding,
  so `length(target_enc)` separates a 4-digit target from a 7-digit one. `String(cents)
  .padStart(12, "0")` costs two lines and `Number("000000200000")` still parses, so the
  existing `decNumber` needs no change. Don't retrofit the existing amount columns —
  there is no re-encryption path in this codebase, only re-wrapping.
- **Seed an encrypted empty list** on first unlocked load, so `lines_enc IS NOT NULL`
  means "has run a recent build", not "this user budgets".
- **Analytics with no properties.** `line_saved` / `line_removed` bare, in the shape of
  `encryption_enabled`. A `{category}` property would ship "this user budgets coffee" to
  PostHog — precisely the fact Postgres was just carefully denied.

**What the operator learns:** that the column is non-null (meaningless after seeding), and
that `profiles.updated_at` moved. Nothing else — not whether you budget, how many, which
categories, what amounts, or whether you're over.

**Locked device:** refuse entirely. The device genuinely cannot tell whether you have zero
Lines or twelve, so show "Locked", not a masked list. Writes take the canonical
`if (!key) return { error: LOCKED_MSG }` guard — and note this also closes the
deletes-work-while-locked gap, since deleting a Line is a rewrite of the whole blob.

**Second device:** works, because the blob lives on the server and the server can't read
it. On save, re-read → decrypt → merge per-Line by the inner `at` → re-encrypt → write.

**Effort:** a few days including the 100% coverage gate.

---

## 4. Recurring payments, inferred

### Verdict: the cleanest of the three on encryption. Blocked on data, not on crypto.

**It costs the encryption model nothing**, because it writes nothing. The detector is a
pure function over decrypted rows in memory — no new table, no new column, no new query,
no RPC, no change to the CSP. Passphrase-tier and default-tier users get bit-identical
results. It is genuinely rare for a feature idea here to lose *nothing* at the passphrase
tier; this one does.

There's a neat irony worth knowing: **cadence was never secret.** `category`, `is_income`
and `occurred_at` are plaintext and indexed, so whoever runs the server could already run
one SQL query and learn that you have a monthly rent and three things in
`fees/subscriptions`. What they can't see — before or after — is *how much*. So the
feature tells you the only part the server can't work out for itself.

But "leaks nothing new" is too strong, and one item is genuinely new:

- **Back-dating.** Today `occurred_at == created_at` for 100% of rows — no code path ever
  writes `occurred_at`. A one-tap "log it, dated the 1st" makes `occurred_at < created_at`
  a visible per-row flag, and `created_at - occurred_at` names the billing period exactly.
  It's a small leak and probably worth taking for the interaction, but take it knowingly.
- Minor: blob length (pad it), `profiles.updated_at` churn, and — don't do this — a
  `recurring_detected` PostHog event would hand over the detector's output next to a
  `person_id` that is the same UUID as `transactions.user_id`.

### Why not yet

The detector needs 3+ occurrences of a series to make a claim. Against the real data:

- Total history is **two months, with August empty**.
- **Zero** rent entries. **Zero** subscriptions. 3 salary entries across 2 people.
- The most active user logs on 14 days out of 60.

It would run, find nothing, and render an empty state for every user. That's not a
crypto problem or an algorithm problem — there is simply nothing there yet.

`FETCH_CAP = 500` is *not* the blocker, incidentally. At the observed ~1 entry/day that's
16 months of history, not four.

### When you do build it

The algorithm notes are worth keeping, because they're where it gets subtle:

- Bucket on **`original_amount` in its original currency**, never `amount_usd_cents` — a
  €9.99 subscription is typed as 9.99 forever, but its home-cents value moves every time
  an FX rate is edited in Settings, and `switchHomeCurrency` doesn't convert history.
- Fit months as **month-index deltas with day-of-month drift**, not "30 days", and clamp
  month-ends so Jan 31 → Feb 28 → Mar 31 scores as stable.
- **Three confidence words, never a percentage**, and never the word "confirmed" for
  something inferred.
- A cancelled series needs no dismiss state — it simply stops appearing.
- Return `null`, not `[]`, from masked rows: every masked row has `original_amount: 0`,
  so the amount bucketing would collapse and cheerfully report that all your groceries
  are one subscription.

### One correction worth recording

It was asserted along the way that reminders are impossible here — no iOS PWA push, no
scheduler, and the server couldn't know the amount anyway. **All three legs are wrong:**

- Home-screen web apps have received Web Push since iOS 16.4, and this app already tells
  users to Add to Home Screen. (`vite-plugin-pwa`'s `generateSW` can't carry a custom push
  handler — but iOS ≥18.4 Declarative Web Push needs no service worker at all.)
- **`pg_cron` ships on every Supabase project including Free**, and jobs are created by
  pasting SQL into the SQL Editor — the operator's existing migration workflow exactly.
- The VAPID *private* key never goes near Vite env; it lives in Edge Function Secrets, the
  same mechanism `delete-account` already uses for the service-role key.
- And a **content-free nudge** ("something's due today") needs no amount at all —
  `due_on` and `category` would be plaintext, the same class as `occurred_at` today.

So a reminder is possible. It's a bigger build than it looks (a custom service worker, a
subscription table, `pushsubscriptionchange` is unsupported on iOS so subscriptions die
silently and must be re-subscribed every launch) — but it is not blocked by the
encryption, and it shouldn't be written off as if it were. An `.ics` export into the
user's own Calendar remains the cheap version.

---

## 5. MCP for Claude / ChatGPT

### Verdict: the honest remote version is a real build with a bad setup story. Do a cut-down version first.

There's no way around the central fact: **for an assistant to answer "how much did I spend
on food", the plaintext number has to reach a machine you don't own.** Claude cannot run
AES-GCM over ciphertext it has no key for. So the architectures sort themselves:

| Architecture | What happens |
|---|---|
| (a) Remote MCP reading Supabase | Sees ciphertext. Can return row counts and category names, **no amounts**. Useless for exactly the users who care most. |
| (b) Remote MCP holding the passphrase or master key | **This ends end-to-end encryption.** Not weakens — ends, standing, for all history past and future. It makes README's "not even whoever runs the server" false and the public `encrypted_users` count a lie about that user. |
| (c) Local stdio MCP on your own machine | Preserves the promise exactly. Can't be installed on an iPhone. |
| (d) PWA as the endpoint | Not possible. No inbound HTTP, phone suspended, and `frame-ancestors 'none'`. |
| (e) Scoped snapshot the phone publishes | Works, at a named price (below). |

### What was checked about the connectors themselves (2026-09-13)

This is where the plan actually breaks, and it has nothing to do with encryption:

- **You cannot add a connector from the Claude iPhone app.** Anthropic's help centre:
  *"It isn't possible to add new connectors (custom or from the directory) on Claude for
  iOS or Android at this time."* The workable flow is **add on claude.ai web or Desktop,
  then use it from the phone** — connectors configured on web do become available on
  mobile at next login.
- Authless *is* supported (Authentication: **None**, plus custom request headers). But a
  **secret in the URL path is the riskiest shape**: there's an open cluster of bugs where
  claude.ai falls back to the *origin's* `/.well-known/oauth-authorization-server` and
  force-marches an authless server into OAuth. On `*.supabase.co` you don't control the
  origin's well-known. Prefer a static header; if you must use a token, host on a domain
  you own.
- **Connectors can't be edited.** Rotating a token embedded in a URL means every user
  removes and re-adds the connector.
- **Free is capped at one custom connector** across all of Claude. On Team/Enterprise only
  an Owner can add one.
- **ChatGPT is materially worse.** Full MCP is Business/Enterprise/Edu; Pro gets read/fetch
  in developer mode; Free gets nothing. Write actions fail under ~680px width — i.e. on
  phones. And it wants OAuth discovery at the *domain root*, which a Supabase edge function
  under `/functions/v1/` cannot serve.

Also worth knowing before committing: Supabase's own "bring your own MCP" guide says
plainly that it covers servers that **do not require authentication** and that "auth
support for MCP on Edge Functions is coming soon." `verify_jwt = off` plus the
service-role key is an unauthenticated public URL with RLS fully bypassed for every user —
a very different blast radius from `delete-account`. And this repo has no
`supabase/config.toml`, no Supabase CLI dependency and no function deploy in CI; the
dashboard editor Supabase itself recommends "only for quick testing and prototypes," with
no version control.

### Recommended: start with the briefing, not the protocol

> One tap in Settings copies a compact, self-describing money briefing — six months of
> totals, this month's category breakdown, your recent entries — onto the clipboard,
> ready to paste into Claude or ChatGPT.

It is the only architecture where "does this survive the passphrase tier" is an unqualified
yes, and the reason is structural: it's generated in the one place the plaintext already
exists — an unlocked browser — from rows already decrypted in memory. **Zero new bytes
reach Postgres.** No server, no OAuth, no connector, no CSP edit, no migration, nothing
for a non-technical user to configure, and it works on both assistants, on a phone, today.

One pure function (`buildBriefing`) plus one card built from `ExportCard`. Roughly a day.

Four things it must get right:

1. **Refuse while masked** — the compound test, and have `buildBriefing` itself return
   null on any masked row. A briefing built while locked is a confident, beautifully
   formatted claim that you spent $0.00 on everything, and no LLM will ever notice.
2. **State its own window in the text.** "All time" is really "newest 500 entries."
   Without that line the assistant will assert lifetime totals.
3. **Pre-format every figure** via `formatCents` with the real home currency.
   `amount_usd_cents` is *home* cents — emit `41250` raw and the assistant reads forty-one
   thousand dollars.
4. **Offer a "summary only" mode** that withholds the free-text notes. Notes are the most
   personal column in the database and the thing an assistant least needs to total your
   groceries.

Name the compromise rather than dressing it up: pasting a briefing discloses real amounts
to Anthropic or OpenAI. That's a real disclosure — but it's one-shot, user-initiated,
bounded to a slice you picked, and it hands over **data, never the key**. Nothing is left
behind that can read tomorrow's transactions. That is a different thing from (b).

### If you want the real connector later

Two honest routes, in order of how much they cost you:

**Local MCP server, for yourself.** A small Node package holding the key locally, talking
to Supabase as you. It preserves the promise literally and can answer *true* all-time
questions the phone can't, because `occurred_at` is plaintext and indexed so it can page
past the 500-row cap. The crypto is genuinely portable — `node:crypto`'s `webcrypto.subtle`
reproduces both envelopes verbatim with no third-party library, and this was proven once
already: `mobile/scripts/crypto-interop.test.mts` ran in CI as `npm run test:interop`
before the React Native client was removed (it's still there at `beec1d7^`). Note there's
currently **no way to get the raw master key out** — only `wrapMasterKey` calls
`exportKey` — so a key hand-off is new code. And be clear-eyed: **a handed-off key cannot
be revoked.** There is no key rotation and no re-encryption path anywhere in this
codebase. Signing out revokes *access*; the copy on that laptop decrypts forever.

**Published encrypted briefing, for everyone.** The phone pre-computes a scoped briefing,
encrypts it under a throwaway key, and stores it; the link carries the key. Supabase at
rest still holds only ciphertext — a dump, a stolen service-role key or a subpoenaed
backup yields nothing. Scope is enforced *by absence*: if you chose "totals only", the row
physically doesn't contain entries, so a prompt-injected assistant can't talk it into one.
Writes go to an inbox the phone re-encrypts and inserts, so the master key still never
moves. The price is the token in the URL and the edge function's blast radius, and the
weak point is freshness, not cryptography — the briefing is only as current as the last
time you opened the app unlocked, so every response needs an `as_of` line.

Whatever you build, tools should return **pre-computed aggregates by default** with raw
rows on demand and capped. LLMs do arithmetic badly, and 500 rows is 30-60k tokens of
context that makes the answer worse.

---

## 6. Two bugs found on the way

Unrelated to the features, both verified:

1. **`src/lib/store.tsx:555` and `src/screens/Safe.tsx:219` use `t.category === SAFE_CATEGORY_ID`**,
   strict equality, where the rest of the codebase folds with
   `splitCategory(t.category).base` (`src/lib/stats.ts:18`, `:257`, and `public_stats()`'s
   `split_part`). Harmless today because nothing writes a sub-category under `safe` — and a
   hard blocker for any design that tags safe transfers (e.g. per-jar goals).

2. **Balances go silently wrong past `FETCH_CAP`.** `balanceCents` and `safeTotalCents` are
   all-time nets over the newest 500 rows; `monthlySpendTotals` and `monthSpendSeries` have
   no cap awareness at all (only `dailySpendSeries` clamps). The sole truncation signal
   anywhere is a PostHog event in `ExportCard` — nothing user-facing. At current usage this
   is ~16 months away, but it will arrive silently.

---

## 7. Recommendation

1. **Lines** (monthly spending limits) — the one to build. No encryption compromise, sits
   where the entries actually are, and it gives people a reason to open the app that isn't
   just record-keeping.
2. **Briefing** (paste into Claude/ChatGPT) — a day's work, no new infrastructure, and it
   answers the "talk to my money" itch without touching the encryption promise. It also
   tells you whether anyone wants this before you build a server.
3. **Recurring** — shelve until there's history to mine. Revisit when a handful of users
   have logged rent or a subscription across four consecutive months.
4. **Remote MCP** — only after (2) shows demand, and only with the setup story written
   down first: *add it on a computer, then use it on your phone.*
