-- Time-limited PDK group access at gyms where our app, not GymFlow, owns
-- the "Booking Access" group — 2026-10-13. Carl: a member left in the
-- group after their slot "could gain access at any time".
--
-- At Fairford Leys GymFlow adds a member to Booking Access for their
-- booking and removes them after, so the group is empty between bookings.
-- Hove isn't on GymFlow, so nothing removed anyone our unlock route added.
-- With app_manages_access_group on, podHQ's /api/pdk/unlock records each
-- add here with the end of the member's unlock window, and the
-- /api/pdk/expire-access cron (every 5 min) removes them once it passes.
--
-- Off by default: at a GymFlow gym, our app removing someone GymFlow added
-- for a booking would lock them out mid-session. Turn Hove's off if it
-- moves to GymFlow.
alter table public.gym_pdk_mapping
  add column app_manages_access_group boolean not null default false;

update public.gym_pdk_mapping set app_manages_access_group = true where gym = 'Hove';

-- One open row per holder per system (removed_at null) — a back-to-back
-- booking extends expires_at instead of adding a second row.
create table public.pdk_access_grants (
  id bigint generated always as identity primary key,
  system_id text not null,
  holder_id text not null,
  expires_at timestamptz not null,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index pdk_access_grants_open_idx
  on public.pdk_access_grants (system_id, holder_id) where removed_at is null;
create index pdk_access_grants_expiry_idx
  on public.pdk_access_grants (expires_at) where removed_at is null;

alter table public.pdk_access_grants enable row level security;
-- No policies — service-role only, same as gym_pdk_mapping.

-- Records or extends a holder's open grant, never shortening it (an unlock
-- for an earlier booking mustn't cut short a later one already granted).
-- One statement, so two concurrent unlocks can't create two open rows.
create or replace function public.upsert_pdk_access_grant(p_system_id text, p_holder_id text, p_expires_at timestamptz)
returns void
language sql
as $$
  insert into public.pdk_access_grants (system_id, holder_id, expires_at)
  values (p_system_id, p_holder_id, p_expires_at)
  on conflict (system_id, holder_id) where removed_at is null
  do update set expires_at = greatest(public.pdk_access_grants.expires_at, excluded.expires_at);
$$;

revoke execute on function public.upsert_pdk_access_grant(text, text, timestamptz) from public, anon, authenticated;
