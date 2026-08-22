-- Fixes cancel_booking()'s cancellation cutoff from 2 hours to 3 hours.
-- Found 2026-08-22: the app had been enforcing a 2-hour window since
-- 0020, but the business's real policy (confirmed against GymFlow, the
-- gym management platform the business actually operates on) is 3 hours.
-- Not a Ts & Cs mismatch this time — the Ts & Cs document's own printed
-- cancellation clause (4hrs Packages/Membership, 8hrs PAYG, separately
-- confirmed outdated the same day) was never the source of truth here;
-- GymFlow's real policy is. Function body otherwise unchanged from 0039 —
-- only the interval literal changes.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

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

  v_refunded := now() < v_slot_start - interval '3 hours';

  update public.bookings set status = 'cancelled' where id = p_booking_id;

  if v_refunded then
    select credit_type into v_credit_type from public.pod_resources where id = v_resource_id;

    insert into public.credits (member_id, amount, reason, booking_id, credit_type)
    values (p_member_id, 1, 'booking_refund', p_booking_id, v_credit_type);
  end if;

  return v_refunded;
end;
$$;
