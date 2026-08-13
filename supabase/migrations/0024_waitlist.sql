/*
  Waitlist for full pod slots: waitlist_entries (the queue) and
  push_subscriptions (per-device web push endpoints), plus an extension
  to create_booking() reserving a freed slot for whoever it's currently
  offered to.

  No CHECK constraint on status columns - same now-established convention
  as notification_log/leads (0021/0022), validated via a TypeScript union
  instead of a hand-pasted DB constraint.
*/

create table if not exists public.waitlist_entries (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  gym text not null,
  slot_start timestamptz not null,
  status text not null default 'waiting', /* waiting | offered | accepted | declined | expired */
  offered_at timestamptz,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_entries_gym_slot_status_idx
  on public.waitlist_entries (gym, slot_start, status);

/*
  Stops a member double-joining the same slot's waitlist while already
  waiting/offered. Re-joining after declining/expiring is fine - that
  row's status has already moved on, so it no longer matches this filter.
*/
create unique index if not exists waitlist_entries_active_member_slot_key
  on public.waitlist_entries (member_id, gym, slot_start) where status in ('waiting', 'offered');

alter table public.waitlist_entries enable row level security;
/* No policies - service-role only, same as notification_log/pod_access_events. */

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
/* No policies - service-role only. */

/*
  create_booking(): adds a reservation check ahead of the existing
  capacity check, same signature/return as 0018_pod_capacity_and_hours.sql.

  Correctness here doesn't depend on any scheduled job running promptly -
  Vercel's Hobby plan (this project's tier) only allows daily cron, far
  too coarse for a 15-minute offer window. An offer past its own
  offer_expires_at is simply never treated as reserved, checked fresh on
  every call (same "computed, not stored" principle already used for the
  leads-conversion filter in podHq/src/lib/data/marketing.ts) - whether
  anything has gotten around to formally marking the row 'expired' is
  irrelevant to whether the slot is actually free right now.

  When a booking is made that fulfils an active offer for that exact
  member, the offer row is marked 'accepted' here directly - the calling
  API route never needs a second write for that, it just calls
  create_booking() the same way self-service booking always has.
*/
create or replace function public.create_booking(p_member_id bigint, p_gym text, p_slot_start timestamptz)
returns bigint
language plpgsql
as $$
declare
  v_balance integer;
  v_booking_id bigint;
  v_capacity integer;
  v_current_count integer;
  v_reserved_for bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_gym || p_slot_start::text));

  select member_id into v_reserved_for
  from public.waitlist_entries
  where gym = p_gym and slot_start = p_slot_start
    and status = 'offered' and offer_expires_at > now()
  limit 1;

  if v_reserved_for is not null and v_reserved_for <> p_member_id then
    raise exception 'slot_reserved';
  end if;

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

  update public.waitlist_entries
  set status = 'accepted'
  where gym = p_gym and slot_start = p_slot_start and member_id = p_member_id
    and status = 'offered';

  return v_booking_id;
end;
$$;
