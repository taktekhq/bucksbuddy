-- BucksBuddy end-to-end encryption, phase 3 (contract): drop the plaintext
-- money columns now that the values live in the `_enc` columns.
--
-- ⚠️ Run this ONLY after scripts/encrypt-backfill.ts has populated every row's
-- `_enc` columns. Verify first with:
--
--   select count(*) from public.transactions
--     where amount_usd_cents_enc is null and amount_usd_cents is not null;
--   select count(*) from public.safe_gold_entries
--     where grams_enc is null and grams is not null;
--
-- Both must be 0. The guard below refuses to run otherwise, so a premature run
-- can't lose data.
do $$
begin
  if exists (
    select 1 from public.transactions
    where amount_usd_cents_enc is null and amount_usd_cents is not null
  ) then
    raise exception 'Aborting: some transactions are not yet encrypted — run the backfill first.';
  end if;
  if exists (
    select 1 from public.safe_gold_entries
    where grams_enc is null and grams is not null
  ) then
    raise exception 'Aborting: some gold entries are not yet encrypted — run the backfill first.';
  end if;
end $$;

alter table public.transactions
  drop column if exists amount_usd_cents,
  drop column if exists original_amount,
  drop column if exists note;

alter table public.safe_gold_entries
  drop column if exists grams,
  drop column if exists note;
