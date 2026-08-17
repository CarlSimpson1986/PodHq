-- Multiple bookable resources per gym — function half (see 0038 for the
-- schema). Requires 0038 applied first (pod_resources, bookings/
-- waitlist_entries.resource_id, credits/catalog_items.credit_type must
-- already exist).

-- create_booking(): p_gym dropped from the signature — gym is now
-- derived from the resource row itself rather than trusted as a
-- separately-passed parameter, since a caller could otherwise pass a
-- resource_id from one gym alongside a p_gym for another and produce an
-- inconsistent bookings row. Every existing caller (self-service
-- /api/bookings, podHq's createManualBooking, the waitlist-accept route)
-- must be updated to pass p_resource_id instead of p_gym in the same
-- deploy as this migration — a stale caller will fail loudly (wrong
-- argument count/type), not silently.
create or replace function public.create_booking(p_member_id bigint, p_resource_id bigint, p_slot_start timestamptz)
returns bigint
language plpgsql
as $$
declare
  v_gym text;
  v_capacity integer;
  v_credit_type text;
  v_slot_duration_minutes integer;
  v_balance integer;
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

  -- Slot alignment against this specific resource's own duration — a
  -- static CHECK constraint couldn't do this (needs the resource row),
  -- see 0038's comment on the dropped bookings.slot_start CHECK. Same
  -- effective rule as the old hour-only CHECK when
  -- slot_duration_minutes=60 (minute component must be exactly 0); a
  -- 30-min resource also allows :30.
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

  select coalesce(sum(amount), 0) into v_balance
  from public.credits
  where member_id = p_member_id and credit_type = v_credit_type;

  if v_balance < 1 then
    raise exception 'insufficient_credits';
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
  values (p_member_id, -1, 'booking_used', v_booking_id, v_credit_type);

  update public.waitlist_entries
  set status = 'accepted'
  where resource_id = p_resource_id and slot_start = p_slot_start and member_id = p_member_id
    and status = 'offered';

  return v_booking_id;
end;
$$;

-- cancel_booking(): signature unchanged (still booking_id-scoped) — only
-- the refund insert changes, deriving credit_type via a join through the
-- booking's own resource_id rather than needing a new parameter.
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
    select credit_type into v_credit_type from public.pod_resources where id = v_resource_id;

    insert into public.credits (member_id, amount, reason, booking_id, credit_type)
    values (p_member_id, 1, 'booking_refund', p_booking_id, v_credit_type);
  end if;

  return v_refunded;
end;
$$;

-- get_credit_balance(): p_credit_type is a default, not a required new
-- arg, so all 4 existing call sites across both repos keep compiling
-- and behaving correctly with zero changes.
create or replace function public.get_credit_balance(p_member_id bigint, p_credit_type text default 'pod')
returns integer
language sql
stable
as $$
  select coalesce(sum(amount), 0)::integer
  from public.credits
  where member_id = p_member_id and credit_type = p_credit_type;
$$;
