-- OWASP audit (2026-08-16) found a TOCTOU race: compMembership and
-- createMembershipWithSavedCard each did a plain "select existing
-- membership, then act if not active" — two concurrent requests for the
-- same member (a double-click, a client retry) could both pass the check
-- and both write, producing two credit grants or two live off-session
-- subscription charges for one membership.
--
-- claim_membership_slot() closes the gap the same way create_booking()
-- already does for slot capacity — a single atomic statement instead of a
-- check-then-write pair. INSERT ... ON CONFLICT ... DO UPDATE ... WHERE
-- only overwrites an existing row if it isn't already 'active'; if it is,
-- the WHERE clause suppresses the update and zero rows come back, so the
-- caller can tell "I won the claim" (1 row) from "someone already holds
-- this membership" (0 rows) without a separate SELECT.
--
-- Safe to re-run: idempotent (create or replace), matching every migration
-- since 0001.
create or replace function public.claim_membership_slot(
  p_member_id bigint,
  p_tier_id text,
  p_tier_name text,
  p_credits_per_period integer,
  p_status text,
  p_current_period_end timestamptz,
  p_stripe_subscription_id text
) returns setof public.memberships
language sql
as $$
  insert into public.memberships (
    member_id, tier_id, tier_name, credits_per_period,
    stripe_subscription_id, status, current_period_end, updated_at
  )
  values (
    p_member_id, p_tier_id, p_tier_name, p_credits_per_period,
    p_stripe_subscription_id, p_status, p_current_period_end, now()
  )
  on conflict (member_id) do update
    set tier_id = excluded.tier_id,
        tier_name = excluded.tier_name,
        credits_per_period = excluded.credits_per_period,
        stripe_subscription_id = excluded.stripe_subscription_id,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        updated_at = now()
    where public.memberships.status <> 'active'
  returning *;
$$;
