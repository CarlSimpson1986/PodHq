-- Found in the 2026-09-07 pre-launch review of podhq-client: create_booking()
-- (0086) checks aggregate capacity (v_current_count >= v_capacity) but never
-- whether *this member* already holds a booking for this exact
-- (resource_id, slot_start). Currently unexploitable in production — every
-- real resource today (Aylesbury, Hove's two) has pod_capacity = 1, so a
-- duplicate attempt already hits 'slot_full' as a side effect. The moment
-- any resource is configured with pod_capacity >= 2 (a shared-class-style
-- room, which the schema already supports — see 0038_pod_resources.sql),
-- that side effect disappears and a double-tap "Book" could let one member
-- burn two credits booking the identical slot twice.
--
-- Fix: an explicit exists-check for the member's own existing booking at
-- this exact slot, placed after the two advisory locks already acquired
-- above it (member lock, then slot lock — both from 0086/0064) so it's
-- race-free for free, no new lock needed. Placed before the credit-balance
-- reads, since there's no reason to compute a spend for a booking we're
-- about to reject anyway. Function body otherwise unchanged from 0086.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

create or replace function public.create_booking(p_member_id bigint, p_resource_id bigint, p_slot_start timestamptz)
returns bigint
language plpgsql
as $$
declare
  v_gym text;
  v_capacity integer;
  v_credit_type text;
  v_network_credit_type text;
  v_slot_duration_minutes integer;
  v_member_gym text;
  v_has_membership boolean;
  v_home_balance integer;
  v_network_balance integer;
  v_spend_type text;
  v_booking_id bigint;
  v_current_count integer;
  v_reserved_for bigint;
begin
  select gym, pod_capacity, credit_type, slot_duration_minutes
  into v_gym, v_capacity, v_credit_type, v_slot_duration_minutes
  from public.pod_resources
  where id = p_resource_id;

  if v_gym is null then
    raise exception 'resource_not_found';
  end if;

  select gym into v_member_gym from public.members where id = p_member_id;
  if v_member_gym is null then
    raise exception 'member_not_found';
  end if;

  -- Serializes this member's own concurrent create_booking calls against
  -- each other, closing the credit-balance race described in 0086. Always
  -- acquired before the slot lock below, in that fixed order.
  perform pg_advisory_xact_lock(hashtext('member_credit:' || p_member_id::text));

  select exists(
    select 1 from public.memberships where member_id = p_member_id and status = 'active'
  ) into v_has_membership;

  v_network_credit_type := v_credit_type || '_network';

  if date_trunc('minute', p_slot_start) <> p_slot_start
     or extract(minute from p_slot_start)::integer % v_slot_duration_minutes <> 0
  then
    raise exception 'invalid_slot_alignment';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_resource_id::text || p_slot_start::text));

  select member_id into v_reserved_for
  from public.waitlist_entries
  where resource_id = p_resource_id and slot_start = p_slot_start
    and status = 'offered' and offer_expires_at > now()
  limit 1;

  if v_reserved_for is not null and v_reserved_for <> p_member_id then
    raise exception 'slot_reserved';
  end if;

  -- New in this migration — see header comment above.
  if exists (
    select 1 from public.bookings
    where resource_id = p_resource_id and slot_start = p_slot_start
      and member_id = p_member_id and status = 'booked'
  ) then
    raise exception 'already_booked';
  end if;

  select coalesce(sum(amount), 0) into v_home_balance
  from public.credits
  where member_id = p_member_id and credit_type = v_credit_type;

  select coalesce(sum(amount), 0) into v_network_balance
  from public.credits
  where member_id = p_member_id and credit_type = v_network_credit_type;

  if v_gym = v_member_gym then
    if v_home_balance >= 1 then
      v_spend_type := v_credit_type;
    elsif v_network_balance >= 1 then
      v_spend_type := v_network_credit_type;
    else
      raise exception 'insufficient_credits';
    end if;
  else
    if v_network_balance >= 1 then
      v_spend_type := v_network_credit_type;
    elsif not v_has_membership and v_home_balance >= 1 then
      v_spend_type := v_credit_type;
    else
      raise exception 'insufficient_credits';
    end if;
  end if;

  select count(*) into v_current_count
  from public.bookings
  where resource_id = p_resource_id and slot_start = p_slot_start and status = 'booked';

  if v_current_count >= v_capacity then
    raise exception 'slot_full';
  end if;

  insert into public.bookings (member_id, gym, resource_id, slot_start)
  values (p_member_id, v_gym, p_resource_id, p_slot_start)
  returning id into v_booking_id;

  insert into public.credits (member_id, amount, reason, booking_id, credit_type)
  values (p_member_id, -1, 'booking_used', v_booking_id, v_spend_type);

  update public.waitlist_entries
  set status = 'accepted'
  where resource_id = p_resource_id and slot_start = p_slot_start and member_id = p_member_id
    and status = 'offered';

  return v_booking_id;
end;
$$;
