-- New review windows, two of which include the current, unfinished month.
--
-- Until now a review covered whole FINISHED calendar months only: 'last_month'
-- and 'past_3_months' (the three months ending with last month). The three
-- windows on offer now are:
--
--   this_vs_last   — last month and this one, so the two can be compared
--   last_3_months  — this month and the two before it
--   all_time       — everything, anchored at the account's first entry
--
-- Two of them end at the moment they are asked for, which makes a review a
-- snapshot rather than a finished document. That is the point: the question
-- "how am I doing this month" cannot be answered by a window that stops at the
-- 1st.
--
-- Note for the window constraint 0009 already has: an all-time window can be
-- shorter than a day (an account whose first entry is today), and
-- `spending_reviews_window` is what still requires `period_to > period_from`.
--
-- Safe to re-run. Run it after 0009 and 0010.

-- ===== period_id =====
-- The old ids stay valid. A review already stored under one still renders, and
-- re-adding a constraint validates every existing row — so dropping them would
-- fail on any account that has one.
alter table public.spending_reviews
  drop constraint if exists spending_reviews_period_id_check;
alter table public.spending_reviews
  add constraint spending_reviews_period_id_check check (
    period_id in (
      'this_vs_last',
      'last_3_months',
      'all_time',
      -- superseded, kept so stored rows stay legal
      'last_month',
      'past_3_months'
    )
  );

-- ===== report_eligibility =====
-- Same signature, same rule, one addition: a NULL `p_from` now means "from the
-- account's first entry", which is what 'all_time' needs. Without it the client
-- would have to guess a floor date, and every count that divides by the window
-- (days in the period, unlogged days) would be measured against decades of
-- prehistory the account did not exist for.
--
-- Everything else is unchanged from 0009, including the accepted limit that day
-- offsets are fixed 24-hour blocks while the app buckets by local calendar day
-- (see 0009 for why that is advisory only).
create or replace function public.report_eligibility(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with first_entry as (
    select min(t.occurred_at) as at
    from public.transactions t
    where t.user_id = auth.uid()
  ),
  -- The window's real start. NULL p_from anchors on the first entry; an account
  -- with no entries at all collapses to an empty window, which fails the gate on
  -- the count anyway.
  anchor as (
    select coalesce(p_from, (select at from first_entry), p_to) as from_at
  ),
  -- Whole days only, floored rather than rounded. Two of the windows end at the
  -- moment they are asked for, so the span is fractional: rounding could claim a
  -- day that has not happened, and `generate_series(0, days - 1)` would then
  -- count it as a day with nothing logged.
  bounds as (
    select greatest(
      floor(extract(epoch from (p_to - (select from_at from anchor))) / 86400)::int,
      0
    ) as days
  ),
  rows_in_window as (
    select
      t.is_income,
      split_part(t.category, '/', 1) as base,
      floor(
        extract(epoch from (t.occurred_at - (select from_at from anchor))) / 86400
      )::int as day_index
    from public.transactions t
    where t.user_id = auth.uid()
      and t.occurred_at >= (select from_at from anchor)
      and t.occurred_at <  p_to
  ),
  tallies as (
    select
      count(*) as entry_count,
      count(*) filter (where not is_income and base <> 'safe') as spend_count,
      count(distinct day_index) as days_logged
    from rows_in_window
  ),
  all_days as (
    select generate_series(0, (select days from bounds) - 1) as day_index
  ),
  missing as (
    select d.day_index
    from all_days d
    where not exists (
      select 1 from rows_in_window r where r.day_index = d.day_index
    )
  ),
  runs as (
    select grp, count(*) as len
    from (
      select day_index - row_number() over (order by day_index) as grp
      from missing
    ) grouped
    group by grp
  )
  select jsonb_build_object(
    'periodFrom',       (select from_at from anchor),
    'periodTo',         p_to,
    'periodDays',       (select days from bounds),
    'entryCount',       (select entry_count from tallies),
    'spendCount',       (select spend_count from tallies),
    'loggedDays',       (select days_logged from tallies),
    'longestGapDays',   coalesce((select max(len) from runs), 0),
    'firstEntryAt',     (select at from first_entry),
    -- "Logging goes back to the start of the window": within its first day,
    -- rather than at its exact first instant, so someone whose first entry is
    -- the morning of day one still qualifies. For an all-time window the anchor
    -- IS the first entry, so this is true by construction.
    'coversPeriod',     coalesce(
                          (select at from first_entry)
                            < (select from_at from anchor) + interval '1 day',
                          false
                        ),
    'minSpendEntries',  40,
    'ok',               (select spend_count from tallies) >= 40
                        and coalesce(
                          (select at from first_entry)
                            < (select from_at from anchor) + interval '1 day',
                          false
                        )
  );
$$;

revoke all on function public.report_eligibility(timestamptz, timestamptz) from public;
grant execute on function public.report_eligibility(timestamptz, timestamptz) to authenticated;
