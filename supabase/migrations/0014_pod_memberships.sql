-- Recurring pod memberships (podhq-client Stage 8) — extends the credits
-- ledger's reason enum with 'membership' (granted by the Stripe webhook on
-- each subscription invoice, same idempotency mechanism as 0012's
-- 'purchase': the existing stripe_event_id unique constraint), and adds a
-- memberships table tracking each member's current subscription so the app
-- knows which tier they're on and whether it's still active. One row per
-- member (a second subscription replaces, not appends to, the first) —
-- current-state tracking, unlike credits' append-only ledger, because
-- "which tier is this member on right now" is inherently a current-state
-- question, not a history one.
--
-- Safe to re-run: every statement is idempotent, matching 0001-0013.

alter table public.credits
  drop constraint if exists credits_reason_check;

alter table public.credits
  add constraint credits_reason_check
  check (reason in ('manual_grant', 'booking_used', 'booking_refund', 'purchase', 'membership'));

create table if not exists public.memberships (
  id bigint generated always as identity primary key,
  member_id bigint not null unique references public.members(id),
  tier_id text not null,
  tier_name text not null,
  credits_per_period integer not null,
  stripe_subscription_id text not null unique,
  status text not null check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memberships_member_idx on public.memberships (member_id);

alter table public.memberships enable row level security;

-- Same reasoning as credits' select_own_credits policy — members can read
-- their own row, all writes happen server-side via the service-role client
-- (Stripe webhook only), this policy is defense-in-depth, not load-bearing.
drop policy if exists select_own_membership on public.memberships;
create policy select_own_membership on public.memberships
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
