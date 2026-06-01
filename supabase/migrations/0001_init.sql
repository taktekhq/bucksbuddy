-- BucksBuddy initial schema.
-- Run this in Supabase Dashboard → SQL Editor (or `supabase db push`).
-- Amounts are stored as integer USD cents (amount_usd_cents) as the source of truth.

-- ===== profiles (one row per auth user) =====
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  -- LBP per 1 USD; default 89000.
  lbp_per_usd  integer not null default 89000 check (lbp_per_usd > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ===== transactions =====
-- is_income: true = money IN (income), false = money OUT (expense)
create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  is_income         boolean not null,
  category          text not null,
  amount_usd_cents  integer not null check (amount_usd_cents >= 0),
  original_currency text not null check (original_currency in ('USD','LBP')),
  original_amount   numeric(20,2) not null check (original_amount >= 0),
  rate_used         integer not null,
  occurred_at       timestamptz not null default now(),
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc);

-- ===== Row Level Security =====
alter table public.profiles     enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "own profile - select" on public.profiles;
drop policy if exists "own profile - insert" on public.profiles;
drop policy if exists "own profile - update" on public.profiles;
create policy "own profile - select" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile - insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "own profile - update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own tx - select" on public.transactions;
drop policy if exists "own tx - insert" on public.transactions;
drop policy if exists "own tx - update" on public.transactions;
drop policy if exists "own tx - delete" on public.transactions;
create policy "own tx - select" on public.transactions
  for select using (auth.uid() = user_id);
create policy "own tx - insert" on public.transactions
  for insert with check (auth.uid() = user_id);
create policy "own tx - update" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tx - delete" on public.transactions
  for delete using (auth.uid() = user_id);

-- ===== auto-create profile on signup =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== updated_at maintenance =====
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();
