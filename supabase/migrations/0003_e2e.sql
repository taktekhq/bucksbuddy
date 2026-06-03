-- BucksBuddy end-to-end encryption.
-- Run in Supabase Dashboard → SQL Editor after 0001/0002.
--
-- Adds the per-user key vault and an encrypted-blob column on transactions.
-- The app encrypts each user's existing rows on their next load (it has the
-- key; the server never does), so this migration only prepares the shape.

-- ===== per-user key vault =====
-- One row per user. Holds the user's master key *wrapped* (encrypted) by a key
-- derived from their passphrase — or, for users who haven't turned on a
-- passphrase, by a public default constant. The server cannot derive the master
-- key from this row without the passphrase. `verifier` is a known token
-- encrypted under the master key, used to recognise a correct passphrase.
create table if not exists public.e2e_keys (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  wrapped_key text not null,
  wrap_type   text not null default 'default' check (wrap_type in ('default','passphrase')),
  verifier    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.e2e_keys enable row level security;

drop policy if exists "own e2e key - select" on public.e2e_keys;
drop policy if exists "own e2e key - insert" on public.e2e_keys;
drop policy if exists "own e2e key - update" on public.e2e_keys;
create policy "own e2e key - select" on public.e2e_keys
  for select using (auth.uid() = user_id);
create policy "own e2e key - insert" on public.e2e_keys
  for insert with check (auth.uid() = user_id);
create policy "own e2e key - update" on public.e2e_keys
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists e2e_keys_touch on public.e2e_keys;
create trigger e2e_keys_touch
  before update on public.e2e_keys
  for each row execute function public.touch_updated_at();

-- ===== transactions: encrypted money values (per column) =====
-- Only the money *values* are encrypted, each into its own `_enc` column. The
-- labels (is_income, category, original_currency, rate_used) stay as plaintext
-- columns. This is phase 1 (expand): add the `_enc` columns and make the
-- originals nullable so new rows can be written encrypted. The app backfills
-- nothing on its own — run scripts/encrypt-backfill.ts, verify, then run
-- 0005_drop_plaintext_values.sql to drop the originals (phase 3 / contract).
alter table public.transactions
  add column if not exists amount_usd_cents_enc text,
  add column if not exists original_amount_enc  text,
  add column if not exists note_enc             text;

alter table public.transactions alter column amount_usd_cents drop not null;
alter table public.transactions alter column original_amount  drop not null;
-- (note is already nullable; is_income/category/original_currency/rate_used stay
--  NOT NULL — they remain plaintext.)
