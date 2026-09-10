-- BucksBuddy: more than USD and LBP.
-- Run this in Supabase Dashboard → SQL Editor (after 0001 … 0006). Safe to
-- re-run: every step is guarded.
--
-- Each user now has a HOME currency (what totals are kept and shown in) and
-- any number of secondary currencies, each with a rate expressed as "units of
-- that currency per 1 unit of home" — the same direction as the old
-- "LBP per $1". The app's curated list of codes lives in src/lib/currency.ts.
--
-- Amounts stay where they are: `amount_usd_cents_enc` is now "home cents" —
-- hundredths of the home currency. The column keeps its name (renaming an
-- encrypted column buys nothing), and existing rows keep their numbers: for
-- every existing user the home currency is USD, so nothing changes for them.

-- ===== profiles: home currency + the secondary-currency list =====
alter table public.profiles
  add column if not exists home_currency text not null default 'USD'
    check (home_currency ~ '^[A-Z]{3}$');

-- `currencies` is a jsonb array of {"code": "LBP", "rate": 89500}. Added in a
-- guarded block so the one-time backfill from `lbp_per_usd` runs only when the
-- column is created — a re-run must not clobber rates set since.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'currencies'
  ) then
    alter table public.profiles
      add column currencies jsonb not null
        default '[{"code":"LBP","rate":89500}]'::jsonb
        check (jsonb_typeof(currencies) = 'array');
    -- Carry each user's own LBP rate across.
    update public.profiles
      set currencies = jsonb_build_array(
        jsonb_build_object('code', 'LBP', 'rate', lbp_per_usd)
      );
  end if;
end $$;

-- `lbp_per_usd` is left in place but is no longer written; the app reads it
-- only as a fallback on a database this migration hasn't reached. It can be
-- dropped once every deployment runs the new app:
--   alter table public.profiles drop column if exists lbp_per_usd;

-- ===== transactions: any listed currency, fractional rates =====
-- The check pinned entries to USD or LBP; the app's list is the authority now,
-- so the column only has to look like an ISO code.
alter table public.transactions
  drop constraint if exists transactions_original_currency_check;
alter table public.transactions
  add constraint transactions_original_currency_check
    check (original_currency ~ '^[A-Z]{3}$');

-- Rates were whole numbers (LBP per dollar). "EUR per $1" is 0.92, so the
-- column has to hold fractions.
alter table public.transactions
  alter column rate_used type numeric using rate_used::numeric;

-- Under the new reading, `rate_used` is units of the entry's own currency per
-- 1 home unit — so an entry typed in the home currency has rate 1. Old USD
-- rows stored the LBP rate of the day instead (the app wrote it for every row);
-- with USD as everyone's home so far, 1 is their true value. Guarded so a
-- re-run is a no-op.
update public.transactions
  set rate_used = 1
  where original_currency = 'USD' and rate_used <> 1;
