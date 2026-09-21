-- BucksBuddy: remove the AI spending reviews.
-- Run this in Supabase Dashboard → SQL Editor (or `supabase db push`) after
-- 0012_feedback.sql. Safe to re-run: every step is guarded.
--
-- THIS DESTROYS DATA, and there is no undo. `spending_reviews` holds every
-- review anyone was ever given; dropping the table deletes all of them. The
-- bodies are encrypted with each account's own master key, so there is no
-- copy anywhere else and nothing to recover them from — not even by the
-- operator, which was the whole point of storing them that way. Take a dump
-- of the table first if any of it is wanted.
--
-- What this undoes, and where it came from:
--   * spending_reviews      (0009, constraints widened in 0011)
--   * stripe_events         (0009) — the webhook's idempotency ledger
--   * report_eligibility()  (0009, replaced in 0011) — the 40-expense gate
--
-- The review SCREEN stays. What it shows now is the breakdown the device
-- computes for itself from its own decrypted rows — months, categories,
-- movers, the Safe, what repeats — for two fixed windows. None of that ever
-- touched this database beyond reading the same encrypted transactions every
-- other screen reads, so none of it is affected by anything below.
--
-- The three Edge Functions that used these objects (generate-review,
-- review-start, stripe-webhook) are deleted from the repo. Undeploy them in
-- Dashboard → Edge Functions, and delete their secrets — GEMINI_API_KEY,
-- REVIEW_ALLOWLIST, GEMINI_MODEL, and the Stripe ones if they were ever set
-- (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, REVIEW_PRICE_CENTS, APP_URL).
-- A secret left behind is a live API key nothing is watching. Remove the
-- Stripe webhook endpoint too, or it will retry deliveries into a 404 for
-- days.

-- ===== the reviews themselves =====
-- Policies and indexes go with the table; naming them separately would only
-- be a second thing to keep in step.
drop table if exists public.spending_reviews cascade;

-- ===== the webhook's idempotency ledger =====
-- Only ever written by stripe-webhook, which no longer exists. Without a
-- webhook there is nothing for it to make idempotent.
drop table if exists public.stripe_events cascade;

-- ===== the eligibility gate =====
-- Counts and dates only — it never could read an amount. It existed to answer
-- "does this account have the 40 expenses a review needs", and nothing is
-- gated any more: the charts are worth reading from the first entry.
drop function if exists public.report_eligibility(timestamptz, timestamptz);
