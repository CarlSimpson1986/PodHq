-- Found in the 2026-09-07 pre-launch review of podhq-client:
-- customer.subscription.updated/.deleted in the Stripe webhook
-- (src/app/api/webhooks/stripe/route.ts) does an unconditional update of
-- memberships.status/current_period_end with no check against delivery
-- order. Stripe explicitly does not guarantee webhook delivery order — a
-- stale, redelivered event landing after a newer one could revert a
-- reactivated membership's status back to 'canceled', with nothing to
-- detect or prevent it.
--
-- Fix: a nullable last_stripe_event_created_at column, set to the
-- source event's own `created` timestamp (Stripe-assigned, present on
-- every event) on every successful update. The webhook's update is
-- changed (app-code change, not this migration) to only apply when this
-- column is null (first write) or older than the incoming event's
-- created time — a stale redelivery then matches zero rows and is a
-- deliberate no-op rather than an error.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.memberships
  add column if not exists last_stripe_event_created_at timestamptz;
