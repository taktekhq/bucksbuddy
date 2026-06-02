-- BucksBuddy: retire the standalone safe_entries table.
-- Cash in the Safe is now recorded as normal transactions with the "safe"
-- category, so moving money in/out shows in history and moves your balance.
-- The old table (from 0002_safe.sql) is no longer used. The Safe wasn't rolled
-- out widely, so dropping it (and any rows) is intentional. Run after 0003.

drop table if exists public.safe_entries;
