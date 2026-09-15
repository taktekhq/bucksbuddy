-- BucksBuddy: in-app feedback (Home → the speech bubble next to the Safe).
-- Run this in Supabase Dashboard → SQL Editor, after 0008_drop_legacy.sql.
--
-- Two pieces:
--   1. a PRIVATE `feedback` storage bucket the app uploads screenshots to (and,
--      only when the reporter deliberately switches it on, a JSON dump of their
--      own entries). The `feedback` edge function signs those objects into the
--      GitHub issue it files; nothing here is ever public.
--   2. `feedback_reports`, one row per filed issue. It is the rate limit, and
--      it is the list of what to delete: the app promises a reporter that data
--      shared for a bug is deleted once the bug is fixed, and this is the table
--      that says which storage folder that means.

-- ===== 1. The bucket =====
-- Private (public = false), capped at 5 MB per object, images + the JSON dump
-- only, so a bad client can't turn it into free file hosting.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback',
  'feedback',
  false,
  5242880,
  array[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
    'image/gif', 'image/heic', 'image/heif',
    'application/json'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects live at `<user id>/<ticket>/…`, so the first path segment is the
-- owner. A signed-in user may write and read inside their own folder and
-- nowhere else; nobody may overwrite or delete (the edge function tidies up
-- with the service role, which bypasses RLS).
drop policy if exists "feedback - own folder insert" on storage.objects;
drop policy if exists "feedback - own folder select" on storage.objects;

create policy "feedback - own folder insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "feedback - own folder select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===== 2. The report log =====
create table if not exists public.feedback_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  issue_number   integer,
  -- `<user id>/<ticket>` — the storage folder holding this report's
  -- attachments. Delete it when the issue closes.
  storage_prefix text,
  -- True when the reporter switched on "Include my data", i.e. the folder above
  -- holds their raw entries and the promise to delete applies.
  shared_data    boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists feedback_reports_user_created_idx
  on public.feedback_reports (user_id, created_at desc);

-- No policies, by design: RLS on with nothing granted means no client can read
-- or write this table. Only the edge function, on the service-role key (which
-- bypasses RLS), touches it.
alter table public.feedback_reports enable row level security;

-- Still to do, once: deploy the edge function and give it the GitHub token.
--   supabase secrets set GITHUB_TOKEN=github_pat_… GITHUB_REPO=owner/name
--   supabase functions deploy feedback
-- See supabase/functions/feedback/index.ts and the README.
