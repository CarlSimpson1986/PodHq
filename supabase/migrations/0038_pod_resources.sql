-- Multiple bookable resources per gym — schema half. Introduces
-- pod_resources (one row per bookable resource, many per gym possible)
-- as the new source of truth, superseding gym_kisi_mapping (one row per
-- gym) — the old table is renamed, not dropped, at the end of this file
-- (belt-and-braces safety net, see that statement's own comment).
-- Berkhamsted gets two
-- identical Kisi-based resources seeded here (its pod-booking feature
-- has never actually been turned on — zero live bookings/members there
-- today, confirmed live 2026-08-17, so this is a genuinely safe first
-- multi-resource gym). Brighton's resources (PDK-based, split credit
-- types, 30-min slots) are deliberately NOT seeded here — that's
-- Milestone 2, and Brighton isn't in either app's GYM_NAMES list yet
-- either. Aylesbury Berryfields (the only gym with real live data) gets
-- its single existing resource carried over unchanged.
--
-- Function changes (create_booking/cancel_booking/get_credit_balance)
-- are a separate migration (0039) — same reasoning this project already
-- documented for splitting large SQL Editor pastes into smaller pieces
-- after repeated paste-corruption incidents (see ROADMAP Stage 7).

create table public.pod_resources (
  id bigint generated always as identity primary key,
  gym text not null,
  resource_key text not null,
  label text not null,
  -- Which credit pool a booking against this resource draws from/refunds
  -- to. Not DB-CHECK-constrained — same reasoning as credit_type below
  -- and waitlist_entries.status/notification_log.event_type elsewhere in
  -- this schema (see 0024_waitlist.sql's own comment): this codebase has
  -- twice been burned by Supabase's SQL Editor mangling a CHECK
  -- constraint's string literal on paste. Validated via a TS union
  -- instead (src/lib/data/types.ts).
  credit_type text not null default 'pod',
  slot_duration_minutes smallint not null default 60
    check (slot_duration_minutes in (30, 60)),
  -- Provider-agnostic door/lock config — Brighton uses ProdataKey (PDK),
  -- not Kisi, confirmed live 2026-08-17. kisi_place_id/kisi_lock_id are
  -- nullable (only populated for access_provider='kisi' resources with
  -- real hardware wired up — Berkhamsted's two rows below are seeded
  -- NULL until real Kisi IDs are obtained, same "booking system ready
  -- before physical door is" pattern as Brighton's PDK gap).
  -- provider_config holds whatever a non-Kisi provider needs; PDK's
  -- actual API shape is unconfirmed as of this migration — no PDK
  -- integration exists anywhere in either repo to design the exact
  -- fields against yet.
  access_provider text not null default 'kisi',
  kisi_place_id bigint,
  kisi_lock_id bigint,
  provider_config jsonb,
  pod_capacity integer not null default 1 check (pod_capacity >= 1),
  open_hour smallint not null default 0,
  close_hour smallint not null default 24
    check (open_hour >= 0 and close_hour <= 24 and open_hour < close_hour),
  latitude numeric,
  longitude numeric,
  unlock_radius_meters integer not null default 300,
  created_at timestamptz not null default now(),
  unique (gym, resource_key)
);

alter table public.pod_resources enable row level security;
-- No policies — service-role only, same pattern gym_kisi_mapping always
-- used (its own comment: "the unlock route is the only thing that ever
-- needs this, and it always uses the admin client").

-- Backfill: one 'pod' resource per existing gym_kisi_mapping row, copying
-- every column across dynamically (not hardcoded) so this is correct
-- regardless of the row's actual current values.
insert into public.pod_resources
  (gym, resource_key, label, credit_type, slot_duration_minutes,
   access_provider, kisi_place_id, kisi_lock_id,
   pod_capacity, open_hour, close_hour, latitude, longitude, unlock_radius_meters)
select
  gym, 'pod', 'Gym Pod', 'pod', 60,
  'kisi', kisi_place_id, kisi_lock_id,
  pod_capacity, open_hour, close_hour, latitude, longitude, unlock_radius_meters
from public.gym_kisi_mapping;

-- Seed Berkhamsted's two identical rooms — same credit_type/slot_duration
-- as the default 'pod' shape above, deliberately NULL Kisi IDs until real
-- hardware IDs are obtained (same reasoning as the header comment).
insert into public.pod_resources (gym, resource_key, label, pod_capacity, open_hour, close_hour)
values
  ('Berkhamsted', 'pod_a', 'Gym Pod A', 1, 0, 24),
  ('Berkhamsted', 'pod_b', 'Gym Pod B', 1, 0, 24);

-- Renamed, not dropped — belt-and-braces per the user's explicit request
-- 2026-08-17, on top of an external JSON export of its pre-migration
-- contents taken the same day. Nothing in either app reads this table by
-- name anymore after this migration (every consumer moved to
-- pod_resources), so the rename is safe to leave in place indefinitely;
-- drop it for real later once comfortable, or never.
alter table public.gym_kisi_mapping rename to gym_kisi_mapping_deprecated_20260817;

-- bookings/waitlist_entries gain resource_id. Added nullable first,
-- backfilled, then set not null — Aylesbury's existing bookings are the
-- only real rows to backfill (Berkhamsted has none live yet).
alter table public.bookings add column resource_id bigint references public.pod_resources(id);
update public.bookings b
set resource_id = (select id from public.pod_resources r where r.gym = b.gym and r.resource_key = 'pod')
where resource_id is null;
alter table public.bookings alter column resource_id set not null;

alter table public.waitlist_entries add column resource_id bigint references public.pod_resources(id);
update public.waitlist_entries w
set resource_id = (select id from public.pod_resources r where r.gym = w.gym and r.resource_key = 'pod')
where resource_id is null;
alter table public.waitlist_entries alter column resource_id set not null;

-- Drop bookings.slot_start's hour-alignment CHECK — a static CHECK can't
-- reference another table for a per-resource slot_duration_minutes, and
-- create_booking() (the only insert path into bookings, confirmed via
-- grep across both repos) will validate alignment against the specific
-- resource's own duration instead (see 0039). Looked up dynamically
-- rather than a hardcoded constraint name, since it was never explicitly
-- named in 0009_pod_booking.sql.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.bookings'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%date_trunc%slot_start%';
  if v_constraint_name is not null then
    execute format('alter table public.bookings drop constraint %I', v_constraint_name);
  end if;
end $$;

-- Indexes: replace the gym-only ones with resource_id-scoped equivalents
-- — two resources at one gym sharing a slot_start would otherwise be
-- coarser/wrong under the old gym-only shape.
drop index if exists public.bookings_gym_slot_idx;
create index bookings_resource_slot_idx on public.bookings (resource_id, slot_start) where status = 'booked';

drop index if exists public.waitlist_entries_active_member_slot_key;
create unique index waitlist_entries_active_member_slot_key
  on public.waitlist_entries (member_id, resource_id, slot_start) where status in ('waiting', 'offered');

drop index if exists public.waitlist_entries_gym_slot_status_idx;
create index waitlist_entries_resource_slot_status_idx on public.waitlist_entries (resource_id, slot_start, status);

-- credits/catalog_items/gift_vouchers gain credit_type — schema only in
-- this migration; Milestone 1 (Berkhamsted) never varies it from the
-- default, so this is zero behavior change until Milestone 2 (Brighton)
-- actually uses non-'pod' values. No DB CHECK, same reasoning as above.
alter table public.credits add column credit_type text not null default 'pod';
alter table public.catalog_items add column credit_type text not null default 'pod';
alter table public.gift_vouchers add column credit_type text not null default 'pod';
