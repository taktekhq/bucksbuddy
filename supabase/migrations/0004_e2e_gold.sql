-- BucksBuddy end-to-end encryption, part 2: the gold ledger.
-- Run after 0003_e2e.sql. Same per-column approach as transactions: the money
-- value (grams) and the note are encrypted into `_enc` columns; is_deposit
-- stays a plaintext label. Phase 1 (expand) only — run the backfill script,
-- verify, then 0005_drop_plaintext_values.sql.
alter table public.safe_gold_entries
  add column if not exists grams_enc text,
  add column if not exists note_enc  text;

alter table public.safe_gold_entries alter column grams drop not null;
-- (note is already nullable; is_deposit stays NOT NULL — it remains plaintext.)
