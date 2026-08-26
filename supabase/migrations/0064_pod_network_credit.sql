-- Cross-gym PAYG top-up credit, 2026-08-26 (same day as 0063's chat-
-- questions work, follow-up session). Builds on cross-gym PAYG booking
-- (podhq-client, same day): a member with an active membership stays
-- locked to their home gym for their *subscription* credit, but can now
-- also book anywhere by spending a separate "network" credit, bought as
-- a PAYG top-up while they have a membership.
--
-- No new column or table: credit_type is plain text, not DB-CHECK-
-- constrained (see 0038_pod_resources.sql) — a PAYG top-up bought while
-- the member has an active membership is simply minted under
-- `<credit_type>_network` (e.g. 'pod_network') instead of the base type
-- (podhq-client's stripe webhook route decides which, at insert time).
-- A member with no active membership keeps minting the base type,
-- unchanged — they already have no gym restriction at all, so there's
-- nothing for a network type to unlock for them.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

-- create_booking(): now resolves a member's own home gym and active-
-- membership status internally (neither was needed before this), and
-- picks which credit type to spend rather than assuming the resource's
-- own base type is the only one that can ever pay for it:
--   - at the member's home gym: either type works, base type spent
--     first (saves the network credit for when it's actually needed
--     elsewhere).
--   - at any other gym: the network type is required for a member with
--     an active membership; a member with none can still spend the base
--     type anywhere, exactly as already shipped this session (no
--     membership = no gym restriction at all).
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

-- cancel_booking(): refunds into whichever type was actually spent for
-- *this specific booking* (read back from its own 'booking_used' credits
-- row), not the resource's fixed base type — those can now genuinely
-- differ (create_booking() above may have spent the network type even
-- at a resource whose own credit_type is the base one). Refunding the
-- wrong type would silently hand a member free credit of a type they
-- never actually held, or fail to restore the one they did.
create or replace function public.cancel_booking(p_member_id bigint, p_booking_id bigint)
returns boolean
language plpgsql
as $$
declare
  v_slot_start timestamptz;
  v_status text;
  v_resource_id bigint;
  v_credit_type text;
  v_refunded boolean;
begin
  select slot_start, status, resource_id into v_slot_start, v_status, v_resource_id
  from public.bookings
  where id = p_booking_id and member_id = p_member_id
  for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  if v_status <> 'booked' then
    raise exception 'already_cancelled';
  end if;

  v_refunded := now() < v_slot_start - interval '2 hours';

  update public.bookings set status = 'cancelled' where id = p_booking_id;

  if v_refunded then
    select credit_type into v_credit_type
    from public.credits
    where booking_id = p_booking_id and reason = 'booking_used'
    limit 1;

    insert into public.credits (member_id, amount, reason, booking_id, credit_type)
    values (p_member_id, 1, 'booking_refund', p_booking_id, v_credit_type);
  end if;

  return v_refunded;
end;
$$;
