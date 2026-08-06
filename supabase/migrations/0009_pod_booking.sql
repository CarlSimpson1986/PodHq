-- Pod booking pilot (Aylesbury only) — member-facing hourly pod bookings,
-- a credit ledger, and the Kisi door-unlock audit trail. New audience:
-- `members` are customers, distinct from `users_gyms` (staff/admin/owner).
--
-- Safe to re-run: every statement is idempotent, matching 0001-0008.

-- ---------------------------------------------------------------------
-- gym_kisi_mapping — Kisi place/lock IDs don't match this app's gym name
-- strings (confirmed live: "My Fit Pod: Aylesbury " in Kisi vs
-- "Aylesbury Berryfields" here), so this is an explicit lookup, never an
-- inferred string match. Service-role only — no policies, matching
-- auth_events/rate_limits (Stage 10 audit): the unlock route is the only
-- thing that ever needs this, and it always uses the admin client.
-- ---------------------------------------------------------------------
create table if not exists public.gym_kisi_mapping (
  gym text primary key,
  kisi_place_id bigint not null,
  kisi_lock_id bigint not null,
  created_at timestamptz not null default now()
);

alter table public.gym_kisi_mapping enable row level security;

-- ---------------------------------------------------------------------
-- members — customers booking pods, not staff. auth_user_id is their own
-- Supabase Auth identity, separate from any users_gyms row.
-- ---------------------------------------------------------------------
create table if not exists public.members (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null unique references auth.users(id),
  gym text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists members_gym_idx on public.members (gym);

alter table public.members enable row level security;

drop policy if exists select_own_member_row on public.members;
create policy select_own_member_row on public.members
  for select to authenticated
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- credits — append-only ledger, not a mutable balance column, matching
-- gym_outgoings' history-over-mutation pattern. Balance = sum(amount) for
-- a member. All real writes happen server-side via the service-role
-- client (manual grants, booking consumption, cancellation refunds) —
-- the insert policy below is defense-in-depth, not load-bearing, same
-- reasoning documented in 0008 for leads.
-- ---------------------------------------------------------------------
create table if not exists public.credits (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  amount integer not null,
  reason text not null check (reason in ('manual_grant', 'booking_used', 'booking_refund')),
  booking_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists credits_member_idx on public.credits (member_id, created_at desc);

alter table public.credits enable row level security;

drop policy if exists select_own_credits on public.credits;
create policy select_own_credits on public.credits
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- bookings — fixed 60-minute slots on the hour, single pod per gym so no
-- capacity/multi-resource logic. No stored slot_end column: `timestamptz +
-- interval` is STABLE, not IMMUTABLE, in Postgres (interval arithmetic can
-- depend on session timezone in general), so it can't be a generated
-- column — Postgres rejects that with 42P17. Since a slot is always
-- exactly 1 hour, slot_end is 100% derivable from slot_start (`slot_start
-- + interval '1 hour'`) and computed at the app/query layer instead of
-- stored. The partial unique index (not a plain unique constraint) only
-- blocks double-booking an *active* slot — a cancelled booking must free
-- the slot for someone else, unlike a plain unique index which would
-- block it forever.
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  gym text not null,
  slot_start timestamptz not null check (date_trunc('hour', slot_start) = slot_start),
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'completed', 'no_show')),
  created_at timestamptz not null default now()
);

create unique index if not exists bookings_gym_slot_active_key
  on public.bookings (gym, slot_start) where status = 'booked';

create index if not exists bookings_member_idx on public.bookings (member_id, slot_start desc);

alter table public.bookings enable row level security;

drop policy if exists select_own_bookings on public.bookings;
create policy select_own_bookings on public.bookings
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));

drop policy if exists insert_own_bookings on public.bookings;
create policy insert_own_bookings on public.bookings
  for insert to authenticated
  with check (member_id in (select id from public.members where auth_user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- pod_access_events — audit trail for every unlock attempt (successful
-- or not), same role for physical door access as auth_events already
-- plays for login. Deliberately zero policies, same reasoning as
-- auth_events/rate_limits (Stage 10 audit): denies all client-side
-- access by default, service-role is the only writer/reader.
-- ---------------------------------------------------------------------
create table if not exists public.pod_access_events (
  id bigint generated always as identity primary key,
  booking_id bigint not null references public.bookings(id),
  member_id bigint not null references public.members(id),
  attempted_at timestamptz not null default now(),
  success boolean not null,
  kisi_response text
);

create index if not exists pod_access_events_booking_idx on public.pod_access_events (booking_id);

alter table public.pod_access_events enable row level security;

-- ---------------------------------------------------------------------
-- Pilot seed: Aylesbury Berryfields' real Kisi place/lock, confirmed live
-- via check-kisi.mjs (place 14501, lock 27130 — unlock verified against
-- the physical door and Kisi's own activity log on 2026-08-05).
-- ---------------------------------------------------------------------
insert into public.gym_kisi_mapping (gym, kisi_place_id, kisi_lock_id)
values ('Aylesbury Berryfields', 14501, 27130)
on conflict (gym) do update set
  kisi_place_id = excluded.kisi_place_id,
  kisi_lock_id = excluded.kisi_lock_id;
