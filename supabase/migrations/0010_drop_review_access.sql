-- Drop the archive-passphrase table.
--
-- 0009 shipped with a `review_access` table holding a second passphrase, set
-- before a first review and used only to lock the archive screen. It is gone:
-- the archive is gated by the account's own encryption passphrase (0003), which
-- this database never sees and never could. One secret, not two.
--
-- Nothing is lost with the table. Reviews were never encrypted under that
-- passphrase — their bodies are sealed with the account's master key, exactly
-- like every amount — so dropping it changes who is asked for what, and nothing
-- about what is readable.
--
-- Run this if you applied an earlier copy of 0009 that created the table. On a
-- database that never had it this is a no-op, so it is safe either way.

drop table if exists public.review_access;
