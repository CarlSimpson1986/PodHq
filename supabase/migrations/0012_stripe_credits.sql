-- Stripe-funded credit purchases (podhq-client Stage 4) — extends the
-- credits ledger's reason enum with 'purchase' and adds an idempotency
-- key so a retried Stripe webhook delivery (Stripe retries on anything
-- but a 2xx response) can't double-credit a member for the same payment.
--
-- Safe to re-run: drop/recreate constraint, add column if not exists.

alter table public.credits
  drop constraint if exists credits_reason_check;

alter table public.credits
  add constraint credits_reason_check
  check (reason in ('manual_grant', 'booking_used', 'booking_refund', 'purchase'));

alter table public.credits
  add column if not exists stripe_event_id text unique;
