-- cancel_booking — member-initiated cancellation for podhq-client's new
-- Cancel button (src/app/api/bookings/cancel/route.ts), enforcing a 2-hour
-- cancellation policy: cancelling more than 2 hours before slot_start
-- refunds the credit (reason 'booking_refund' — already an allowed
-- credits.reason value since 0009_pod_booking.sql, just never used until
-- now); cancelling inside that 2-hour window forfeits it, matching a
-- typical gym no-show policy and discouraging late cancellations that
-- can't be re-filled. `for update` locks the booking row so a rapid
-- double-click can't race past the status check and refund twice — same
-- atomicity concern create_booking() already handles for its own path,
-- via an advisory lock there since it has no single existing row to lock
-- against yet.
--
-- p_member_id is the caller's own member id (resolved server-side from
-- their session, never client-supplied) — doubles as the ownership check:
-- a booking id for someone else's booking simply won't be found.
--
-- Safe to re-run: create or replace.

create or replace function public.cancel_booking(p_member_id bigint, p_booking_id bigint)
returns boolean
language plpgsql
as $$
declare
  v_slot_start timestamptz;
  v_status text;
  v_refunded boolean;
begin
  select slot_start, status into v_slot_start, v_status
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
    insert into public.credits (member_id, amount, reason, booking_id)
    values (p_member_id, 1, 'booking_refund', p_booking_id);
  end if;

  return v_refunded;
end;
$$;
