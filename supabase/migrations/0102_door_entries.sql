-- Monthly cache of door entries pulled from Kisi's and PDK's own event
-- history (src/lib/door-history.ts, /api/door-history/sync). Carl's call
-- 2026-09-25: keep our own copy month by month rather than relying on
-- each vendor's retention, and store every entry (not daily totals) so
-- it can later be matched to members and replace GymFlow's attendance
-- CSV for door-connected gyms.
--
-- Separate from pod_access_events (only this app's own booking-triggered
-- Kisi unlocks) and pdk_access_events (webhook, Fairford Leys only, since
-- 2026-09-18): this table holds every real entry at the door, however
-- the member got in.

-- Kisi place -> podHQ gym. Deliberately not rows in gym_kisi_mapping:
-- that table drives the live unlock route and requires a lock ID, and
-- only Aylesbury is bookable. Place IDs confirmed via Kisi's /places
-- 2026-09-25; "My Fit Pod: Thomley" is Oxford East (confirmed by Carl).
create table public.kisi_place_gyms (
  place_id bigint primary key,
  gym text not null unique,
  created_at timestamptz not null default now()
);

alter table public.kisi_place_gyms enable row level security;
-- No policies — service-role only, same pattern as gym_kisi_mapping.

insert into public.kisi_place_gyms (place_id, gym) values
  (14501, 'Aylesbury Berryfields'),
  (18678, 'Berkhamsted'),
  (21138, 'Milton Keynes'),
  (21756, 'Basingstoke'),
  (22705, 'Oxford East'),
  (22978, 'Kingston upon Thames');

-- One row per entry or refused attempt. Exit-button releases are not
-- stored. source_event_id is the vendor's own event ID (Kisi's uuid) or,
-- for PDK (whose report rows carry no ID), a key built from the event's
-- own fields — unique per system so re-running a month is a no-op.
-- holder_email is kept to match entries to members later; it comes from
-- the door system, not from our own members table.
create table public.door_entries (
  id bigint generated always as identity primary key,
  gym text not null,
  door_system text not null check (door_system in ('kisi', 'pdk')),
  source_event_id text not null,
  occurred_at timestamptz not null,
  outcome text not null check (outcome in ('entry', 'denied')),
  holder_id text,
  holder_name text,
  holder_email text,
  door_name text,
  created_at timestamptz not null default now(),
  unique (door_system, source_event_id)
);

create index door_entries_gym_occurred_idx on public.door_entries (gym, occurred_at desc);

alter table public.door_entries enable row level security;
-- No policies — service-role only. Written by the sync route (CRON_SECRET,
-- no user session), read server-side after the usual gym-scope check.
