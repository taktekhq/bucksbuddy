-- BucksBuddy end-to-end encryption, part 2: the gold ledger.
-- Run after 0003_e2e.sql. Mirrors what 0003 did to transactions: the sensitive
-- fields (is_deposit, grams, note) move into a `ciphertext` blob; only
-- id/user_id/occurred_at/created_at stay plaintext. The app encrypts each
-- user's existing gold rows in place on their next load.

alter table public.safe_gold_entries
  add column if not exists ciphertext text;

alter table public.safe_gold_entries alter column is_deposit drop not null;
alter table public.safe_gold_entries alter column grams      drop not null;
-- (note is already nullable; grams' >= 0 CHECK tolerates NULL.)
