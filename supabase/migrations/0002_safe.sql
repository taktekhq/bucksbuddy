-- BucksBuddy: savings "Safe" (proof of concept).
-- A pot kept SEPARATE from the monthly transactions: a running, all-time total
-- you add money to and take money out of. It never touches the monthly net.
-- Run this in Supabase Dashboard → SQL Editor (after 0001_init.sql).
--
-- Amounts are integer USD cents (amount_usd_cents) like transactions; direction
-- lives in is_deposit (true = added to the safe, false = taken out).

create table if not exists public.safe_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  is_deposit        boolean not null,
  amount_usd_cents  integer not null check (amount_usd_cents >= 0),
  original_currency text not null check (original_currency in ('USD','LBP')),
  original_amount   numeric(20,2) not null check (original_amount >= 0),
  rate_used         integer not null,
  note              text,
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists safe_entries_user_occurred_idx
  on public.safe_entries (user_id, occurred_at desc);

-- ===== Row Level Security (own rows only, same as transactions) =====
alter table public.safe_entries enable row level security;

drop policy if exists "own safe - select" on public.safe_entries;
drop policy if exists "own safe - insert" on public.safe_entries;
drop policy if exists "own safe - update" on public.safe_entries;
drop policy if exists "own safe - delete" on public.safe_entries;
create policy "own safe - select" on public.safe_entries
  for select using (auth.uid() = user_id);
create policy "own safe - insert" on public.safe_entries
  for insert with check (auth.uid() = user_id);
create policy "own safe - update" on public.safe_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own safe - delete" on public.safe_entries
  for delete using (auth.uid() = user_id);
