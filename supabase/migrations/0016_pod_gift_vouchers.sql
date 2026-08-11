-- Gift vouchers (podhq-client Stage 9) — a purchasable code, generated at
-- Checkout-creation time (so it can be shown on the success page
-- immediately, no race with the webhook), but only ever inserted into this
-- table once Stripe confirms payment via checkout.session.completed —
-- generating it early and inserting it early would mean an abandoned
-- checkout leaves a free, spendable code sitting in the DB forever. Widens
-- credits.reason with 'gift_voucher' for the redemption-side credit grant.
--
-- Safe to re-run: every statement is idempotent, matching 0001-0015.

alter table public.credits
  drop constraint if exists credits_reason_check;

alter table public.credits
  add constraint credits_reason_check
  check (reason in ('manual_grant', 'booking_used', 'booking_refund', 'purchase', 'membership', 'gift_voucher'));

create table if not exists public.gift_vouchers (
  id bigint generated always as identity primary key,
  code text not null unique,
  amount_gbp numeric not null,
  credits integer not null,
  purchaser_member_id bigint not null references public.members(id),
  redeemed_by_member_id bigint references public.members(id),
  redeemed_at timestamptz,
  stripe_event_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists gift_vouchers_purchaser_idx on public.gift_vouchers (purchaser_member_id);

alter table public.gift_vouchers enable row level security;

-- No client policies — same pattern as credits/memberships: all real reads
-- and writes go through the service-role client after the app has already
-- checked who's asking, this is defense-in-depth only.
