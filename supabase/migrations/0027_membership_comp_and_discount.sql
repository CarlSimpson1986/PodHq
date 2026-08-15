-- Staff-sold/comped memberships & credit packs (podHq's new /pods/members/[id]
-- "Sell a pack or membership" feature). A comped membership has no real
-- Stripe subscription behind it (no auto-renew/auto-bill, matching the
-- ledger-only design already used for the manual_grant credit reason) —
-- memberships.stripe_subscription_id was `not null unique`
-- (0014_pod_memberships.sql), which blocks that entirely. Widened to
-- nullable; the unique constraint still holds (Postgres allows multiple
-- NULLs under a unique constraint), so real Stripe-backed rows are still
-- protected from duplicates.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.memberships
  alter column stripe_subscription_id drop not null;
