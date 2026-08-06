-- create_booking — atomically checks credit balance, inserts the booking,
-- and deducts one credit. A single function call is one Postgres
-- transaction: if the partial unique index on (gym, slot_start) rejects a
-- double-booking, the whole thing rolls back and no credit is deducted —
-- can't happen via two separate app-level inserts without that guarantee.
--
-- Safe to re-run: create or replace.

create or replace function public.create_booking(p_member_id bigint, p_gym text, p_slot_start timestamptz)
returns bigint
language plpgsql
as $$
declare
  v_balance integer;
  v_booking_id bigint;
begin
  select coalesce(sum(amount), 0) into v_balance
  from public.credits
  where member_id = p_member_id;

  if v_balance < 1 then
    raise exception 'insufficient_credits';
  end if;

  insert into public.bookings (member_id, gym, slot_start)
  values (p_member_id, p_gym, p_slot_start)
  returning id into v_booking_id;

  insert into public.credits (member_id, amount, reason, booking_id)
  values (p_member_id, -1, 'booking_used', v_booking_id);

  return v_booking_id;
end;
$$;
