-- Staff-initiated Stripe refunds (podHq admin + podhq-client webhook).
-- Refunding requires the original payment/charge reference, which nothing
-- captured until now — only stripe_event_id (the webhook event id) was ever
-- stored, and that's not enough to call stripe.refunds.create(). This adds
-- the payment_intent id at purchase time so a refund can be looked up and
-- issued later, plus a 'refund' reason so the ledger correction (a negative
-- credits row, written by podhq-client's webhook once Stripe confirms the
-- refund) has somewhere to land.
--
-- Safe to re-run: every statement is idempotent, matching 0001-0020.

alter table public.credits
  add column if not exists stripe_payment_intent_id text;

alter table public.credits
  drop constraint if exists credits_reason_check;

alter table public.credits
  add constraint credits_reason_check
  check (reason in ('manual_grant', 'booking_used', 'booking_refund', 'purchase', 'membership', 'gift_voucher', 'refund'));

alter table public.gift_vouchers
  add column if not exists stripe_payment_intent_id text,
  add column if not exists refunded_at timestamptz;
