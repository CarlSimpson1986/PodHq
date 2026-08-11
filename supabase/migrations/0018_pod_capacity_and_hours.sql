-- Pod capacity + bookable hours (podHq admin backend for podhq-client's
-- pod bookings) — lets staff configure how many concurrent bookings a
-- gym's pod can hold per hour slot, and which hours are open for
-- self-service booking. Both default to today's existing behaviour
-- (capacity 1, open all 24 hours) so no existing gym's behaviour changes
-- until explicitly reconfigured.
--
-- Safe to re-run: idempotent.

alter table public.gym_kisi_mapping
  add column if not exists pod_capacity integer not null default 1,
  add column if not exists open_hour smallint not null default 0,
  add column if not exists close_hour smallint not null default 24;

alter table public.gym_kisi_mapping
  drop constraint if exists gym_kisi_mapping_pod_capacity_check;
alter table public.gym_kisi_mapping
  add constraint gym_kisi_mapping_pod_capacity_check check (pod_capacity >= 1);

alter table public.gym_kisi_mapping
  drop constraint if exists gym_kisi_mapping_hours_check;
alter table public.gym_kisi_mapping
  add constraint gym_kisi_mapping_hours_check
  check (open_hour >= 0 and open_hour <= 23 and close_hour >= 1 and close_hour <= 24 and open_hour < close_hour);

-- The old partial unique index (0009_pod_booking.sql) hard-capped every
-- gym at exactly one concurrent booking per slot — too strict now that
-- pod_capacity can be >1. Capacity is enforced inside create_booking()
-- instead (below), serialized via an advisory lock so two concurrent
-- booking attempts for the same gym+slot can't both read "space free" and
-- both insert, exceeding capacity — the same race the old unique index
-- prevented for free, which a plain row-count check on its own would not.
drop index if exists public.bookings_gym_slot_active_key;

create index if not exists bookings_gym_slot_idx
  on public.bookings (gym, slot_start) where status = 'booked';

-- create_booking — same signature and credit-deduction behaviour as
-- 0010_create_booking_function.sql, now also capacity-checked. Used by
-- both podhq-client's self-service /api/bookings and podHq's new
-- staff-initiated manual booking route — a manual booking still consumes
-- a credit exactly like a self-service one (staff grant a manual_grant
-- credit first if the member doesn't have one), and still can't exceed
-- the gym's real physical pod capacity, staff override or not. Bookable
-- *hours* are deliberately NOT enforced here — that's a self-service-only
-- restriction, checked in podhq-client's own route, so staff can
-- knowingly book outside normal hours when it's a genuine exception.
create or replace function public.create_booking(p_member_id bigint, p_gym text, p_slot_start timestamptz)
returns bigint
language plpgsql
as $$
declare
  v_balance integer;
  v_booking_id bigint;
  v_capacity integer;
  v_current_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_gym || p_slot_start::text));

  select coalesce(sum(amount), 0) into v_balance
  from public.credits
  where member_id = p_member_id;

  if v_balance < 1 then
    raise exception 'insufficient_credits';
  end if;

  select pod_capacity into v_capacity
  from public.gym_kisi_mapping
  where gym = p_gym;

  if v_capacity is null then
    v_capacity := 1;
  end if;

  select count(*) into v_current_count
  from public.bookings
  where gym = p_gym and slot_start = p_slot_start and status = 'booked';

  if v_current_count >= v_capacity then
    raise exception 'slot_full';
  end if;

  insert into public.bookings (member_id, gym, slot_start)
  values (p_member_id, p_gym, p_slot_start)
  returning id into v_booking_id;

  insert into public.credits (member_id, amount, reason, booking_id)
  values (p_member_id, -1, 'booking_used', v_booking_id);

  return v_booking_id;
end;
$$;
