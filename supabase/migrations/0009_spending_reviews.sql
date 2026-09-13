-- BucksBuddy paid spending reviews.
-- Run this in Supabase Dashboard → SQL Editor (or `supabase db push`) after
-- 0001 … 0008. Safe to re-run: every step is guarded.
--
-- Three tables and one function:
--   * spending_reviews — one row per purchase. Written only by the edge
--     functions (service role); the browser may read its own rows and may write
--     back exactly one column, the encrypted body, because it is the only party
--     that holds the key.
--   * review_access    — the archive passphrase, as an unreadable token.
--   * stripe_events    — every webhook event id we have already applied, so a
--     Stripe retry cannot pay for a review twice.
--   * report_eligibility() — counts and dates only, which is all the gate needs
--     and all the server can see: the amounts are encrypted per-column (0003).

-- ===== spending_reviews =====
create table if not exists public.spending_reviews (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- pending  : checkout created, money not confirmed
  -- paid     : Stripe says it is paid; the review may now be generated
  -- ready    : the model has written it (the body may still be in flight to us)
  -- failed   : generation gave up; `error` says why and a refund is owed
  -- refunded : money returned (refund or dispute)
  status              text not null default 'pending'
                        check (status in ('pending','paid','ready','failed','refunded')),
  period_id           text not null check (period_id in ('last_month','past_3_months')),
  -- The window the review covers, half-open [period_from, period_to).
  period_from         timestamptz not null,
  period_to           timestamptz not null,
  home_currency       text not null check (home_currency ~ '^[A-Z]{3}$'),
  -- What was actually charged, in Stripe's own units.
  price_cents         integer not null check (price_cents > 0),
  price_currency      text not null check (price_currency ~ '^[a-z]{3}$'),
  checkout_session_id text unique,
  payment_intent_id   text,
  paid_at             timestamptz,
  refunded_at         timestamptz,
  -- The review itself: AES-GCM under the account's master key, exactly like
  -- every amount in `transactions`. The server never sees this plaintext at
  -- rest; the generating function returns it to the browser, which encrypts it
  -- and writes it back here.
  body_enc            text,
  -- Generation attempts spent. Bounded so a lost response can be retried for
  -- free but a paid review cannot mint unlimited model calls.
  attempts            integer not null default 0 check (attempts >= 0),
  model               text,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint spending_reviews_window check (period_to > period_from)
);

create index if not exists spending_reviews_user_created_idx
  on public.spending_reviews (user_id, created_at desc);

alter table public.spending_reviews enable row level security;

-- Read your own reviews; write nothing but the encrypted body. Everything that
-- decides whether a review exists, is paid for, or is ready is written by an
-- edge function with the service-role key, which bypasses RLS.
drop policy if exists "own review - select" on public.spending_reviews;
drop policy if exists "own review - store body" on public.spending_reviews;
create policy "own review - select" on public.spending_reviews
  for select using (auth.uid() = user_id);
create policy "own review - store body" on public.spending_reviews
  for update using (auth.uid() = user_id and status in ('paid','ready'))
  with check (auth.uid() = user_id);

-- Supabase grants the API roles broad table rights by default, so narrow them
-- explicitly: column-level UPDATE is what keeps "store the body" from becoming
-- "mark my own unpaid review as ready".
revoke all on public.spending_reviews from anon, authenticated;
grant select on public.spending_reviews to authenticated;
grant update (body_enc) on public.spending_reviews to authenticated;

drop trigger if exists spending_reviews_touch on public.spending_reviews;
create trigger spending_reviews_touch
  before update on public.spending_reviews
  for each row execute function public.touch_updated_at();

-- ===== review_access =====
-- The archive passphrase, held the way the key vault holds a wrapped key: a
-- random token encrypted under a PBKDF2 key derived from the passphrase. A
-- correct passphrase unwraps it; a wrong one fails AES-GCM authentication. The
-- passphrase itself is never stored or sent, and reviews are NOT encrypted
-- under it — replacing it loses nothing.
create table if not exists public.review_access (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  verifier   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_access enable row level security;

drop policy if exists "own review access - select" on public.review_access;
drop policy if exists "own review access - insert" on public.review_access;
drop policy if exists "own review access - update" on public.review_access;
create policy "own review access - select" on public.review_access
  for select using (auth.uid() = user_id);
create policy "own review access - insert" on public.review_access
  for insert with check (auth.uid() = user_id);
create policy "own review access - update" on public.review_access
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists review_access_touch on public.review_access;
create trigger review_access_touch
  before update on public.review_access
  for each row execute function public.touch_updated_at();

-- ===== stripe_events =====
-- Idempotency ledger for the webhook. RLS on with no policies at all: the
-- browser has no business here, and the service role bypasses RLS.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  review_id   uuid references public.spending_reviews(id) on delete set null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ===== report_eligibility =====
-- The gate, in one place. The browser calls it to show someone where they
-- stand; the checkout function calls it to refuse a purchase — so the rule
-- cannot be edited in devtools, and it counts EVERY row the account has rather
-- than the newest few hundred the app keeps in memory.
--
-- Bounds arrive as timestamps from the client, which computes them from local
-- calendar months (lib/reportPeriod). Days are then counted as offsets from
-- `p_from`, so "days logged" means the same thing here as it does on screen.
--
-- SECURITY INVOKER (the default): row-level security on `transactions` already
-- limits this to the caller's own rows, and the explicit user_id filter says so
-- out loud. It returns nothing but counts.
create or replace function public.report_eligibility(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with bounds as (
    select greatest(
      (extract(epoch from (p_to - p_from)) / 86400)::int, 0
    ) as days
  ),
  rows_in_window as (
    select
      t.is_income,
      split_part(t.category, '/', 1) as base,
      floor(extract(epoch from (t.occurred_at - p_from)) / 86400)::int as day_index
    from public.transactions t
    where t.user_id = auth.uid()
      and t.occurred_at >= p_from
      and t.occurred_at <  p_to
  ),
  tallies as (
    select
      count(*) as entry_count,
      count(*) filter (where not is_income and base <> 'safe') as spend_count,
      count(distinct day_index) as days_logged
    from rows_in_window
  ),
  all_days as (
    select generate_series(0, (select days from bounds) - 1) as day_index
  ),
  missing as (
    select d.day_index
    from all_days d
    where not exists (
      select 1 from rows_in_window r where r.day_index = d.day_index
    )
  ),
  -- Classic gaps-and-islands: consecutive missing days share a constant
  -- (index - row_number), so grouping on it measures each unlogged run. The
  -- window function has to be computed in a subquery — Postgres will not group
  -- by one directly.
  runs as (
    select grp, count(*) as len
    from (
      select day_index - row_number() over (order by day_index) as grp
      from missing
    ) grouped
    group by grp
  ),
  first_entry as (
    select min(t.occurred_at) as at
    from public.transactions t
    where t.user_id = auth.uid()
  )
  select jsonb_build_object(
    'periodFrom',       p_from,
    'periodTo',         p_to,
    'periodDays',       (select days from bounds),
    'entryCount',       (select entry_count from tallies),
    'spendCount',       (select spend_count from tallies),
    'loggedDays',       (select days_logged from tallies),
    'longestGapDays',   coalesce((select max(len) from runs), 0),
    'firstEntryAt',     (select at from first_entry),
    -- "A month of logged expenses behind you": logging started within the first
    -- day of the window rather than exactly at its first instant, so someone
    -- whose first entry is the morning of day one still qualifies.
    'coversPeriod',     coalesce(
                          (select at from first_entry) < p_from + interval '1 day',
                          false
                        ),
    'minSpendEntries',  40,
    'ok',               (select spend_count from tallies) >= 40
                        and coalesce(
                          (select at from first_entry) < p_from + interval '1 day',
                          false
                        )
  );
$$;

revoke all on function public.report_eligibility(timestamptz, timestamptz) from public;
grant execute on function public.report_eligibility(timestamptz, timestamptz) to authenticated;
