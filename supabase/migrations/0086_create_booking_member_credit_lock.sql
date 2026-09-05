-- Fixes a credit double-spend race in create_booking(), found 2026-09-05
-- wargaming production concurrency (the specific worry: "two people
-- booking at the same time", per the known GymFlow incident). The
-- existing pg_advisory_xact_lock (0039, extended in 0064) is keyed on
-- resource_id + slot_start, so it correctly serializes two different
-- members racing for the *same* slot. It does nothing for one member
-- firing two concurrent create_booking calls at *different* slots: each
-- call re-reads sum(credits) independently under READ COMMITTED, so both
-- can see the same balance before either inserts its spend, letting one
-- credit pay for two real bookings. Reproduced live against production
-- (member's own account, 1 credit, two future slots, cleaned up after):
-- both calls returned a booking_id, balance went to -1.
--
-- Fix: take a second advisory lock keyed on the member, acquired before
-- the slot lock (fixed acquisition order — member lock first, then slot
-- lock — every time, so this can never deadlock against itself). This
-- serializes all of one member's concurrent booking attempts without
-- affecting different members booking different slots concurrently.
-- Function body otherwise unchanged from 0064.
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
  -- each other, closing the credit-balance race described above. Always
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
