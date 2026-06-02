-- BucksBuddy: gold in the Safe.
-- Gold is tracked in GRAMS as the source of truth — no currency conversion is
-- stored. (The app may show an approximate value from a live price API, but
-- that's display-only and never persisted.) Kept in its own table so the
-- money-centric safe_entries stays clean.
-- Run this in Supabase Dashboard → SQL Editor (after 0002_safe.sql).

create table if not exists public.safe_gold_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  is_deposit  boolean not null,                       -- true = added, false = taken out
  grams       numeric(20,3) not null check (grams >= 0),
  note        text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists safe_gold_entries_user_occurred_idx
  on public.safe_gold_entries (user_id, occurred_at desc);

-- ===== Row Level Security (own rows only) =====
alter table public.safe_gold_entries enable row level security;

drop policy if exists "own safe gold - select" on public.safe_gold_entries;
drop policy if exists "own safe gold - insert" on public.safe_gold_entries;
drop policy if exists "own safe gold - update" on public.safe_gold_entries;
drop policy if exists "own safe gold - delete" on public.safe_gold_entries;
create policy "own safe gold - select" on public.safe_gold_entries
  for select using (auth.uid() = user_id);
create policy "own safe gold - insert" on public.safe_gold_entries
  for insert with check (auth.uid() = user_id);
create policy "own safe gold - update" on public.safe_gold_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own safe gold - delete" on public.safe_gold_entries
  for delete using (auth.uid() = user_id);
