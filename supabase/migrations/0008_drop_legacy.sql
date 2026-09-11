-- BucksBuddy: drop what nothing reads any more.
-- Run this in Supabase Dashboard → SQL Editor after 0007_currencies.sql, once
-- the app that came with 0007 is deployed (it neither reads nor writes any of
-- this). Safe to re-run: every step is `if exists`.

-- profiles.lbp_per_usd: the single LBP-per-dollar rate from when USD was the
-- only home currency. 0007 copied each user's value into profiles.currencies
-- as {"code":"LBP","rate":…}, and nothing has read or written the column
-- since. Its check constraint goes with it.
alter table public.profiles drop column if exists lbp_per_usd;

-- safe_entries: an early build kept cash in the Safe in its own table before
-- that moved into `transactions` under the "safe" category. Empty and ignored
-- ever since; only present on databases set up from that build.
drop table if exists public.safe_entries;
