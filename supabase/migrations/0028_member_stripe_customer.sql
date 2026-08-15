-- Card-on-file for staff-sold packs/memberships (podHq's /pods/members/[id]
-- "Sell a pack or membership" feature, extended 2026-08-15 after comparing
-- against GymFlow's own member page, which reuses a saved default payment
-- method instead of re-collecting card details on every repeat sale).
--
-- stripe_customer_id is captured by podhq-client's webhook (checkout.session
-- .completed / customer.subscription.created) whenever a Checkout Session
-- includes a Stripe Customer — which podHq's sales routes now always
-- request (customer_creation: 'always' on first purchase, or the existing
-- customer id passed on repeat ones) — and is what a later staff-initiated
-- off-session charge looks up to find the member's saved card.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.members
  add column if not exists stripe_customer_id text;
