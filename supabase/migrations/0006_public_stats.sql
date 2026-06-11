-- BucksBuddy public stats: one rpc the Stats page (and signed-out visitors)
-- can call for the community numbers.
-- Run this in Supabase Dashboard → SQL Editor (or `supabase db push`).
--
-- Aggregate and anonymous by construction: amounts are encrypted per-column
-- (see 0003), so the only thing the server can count across users is row
-- counts and the plaintext labels. SECURITY DEFINER lets the aggregate read
-- across RLS; callers only ever receive the rolled-up jsonb below — never row
-- data. Keep it that way if you extend it.
create or replace function public.public_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users',           (select count(*) from public.profiles),
    'transactions',    (select count(*) from public.transactions),
    -- Users who set a real passphrase (true E2E), not the default wrap.
    'encrypted_users', (select count(*) from public.e2e_keys
                         where wrap_type = 'passphrase'),
    -- Most-logged spending categories by entry count (amounts are ciphertext,
    -- so counts are the honest best). Subcategories fold into their parent
    -- ("food/restaurant" → "food"); internal safe transfers don't count.
    'top_categories',  (
      select coalesce(
        jsonb_agg(jsonb_build_object('category', category, 'count', n)
                  order by n desc),
        '[]'::jsonb)
      from (
        select split_part(category, '/', 1) as category, count(*) as n
        from public.transactions
        where not is_income and split_part(category, '/', 1) <> 'safe'
        group by 1
        order by n desc
        limit 6
      ) t
    )
  );
$$;

-- Viewable by everyone: signed-out visitors call this with the anon key.
revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
