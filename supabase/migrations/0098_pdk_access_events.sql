-- PDK (ProdataKey) door-access integration — replaces Kisi at Fairford
-- Leys and Brighton (Hove). Separate tables from gym_kisi_mapping/
-- pod_access_events rather than widening those: PDK's webhook payload
-- shape (holder/device names, an event topic) doesn't map cleanly onto
-- Kisi's booking-triggered success/response shape, and PDK events aren't
-- tied to a booking_id at all — they're pushed for every real-world door
-- event, whether or not our own app was involved. Confirmed real org IDs
-- via a live API call 2026-09-18 (dealer S&D Facilities LTD,
-- organization 6a22a8790d0d890ad6dfe37f) — org_id and system_id are
-- genuinely different values, not the same UUID as they first appeared
-- to be from the dashboard's URLs.
--
-- Fairford Leys is the only row seeded here — first real test per Carl's
-- own call 2026-09-18 ("just use FFL for now as we can test that
-- properly"). Brighton (Hove) has its real IDs already confirmed too
-- (org 6aa8ddf8cafcae7027083667) but is deliberately not added until
-- Fairford Leys' webhook is verified working end to end.
create table public.gym_pdk_mapping (
  gym text primary key,
  organization_id text not null,
  system_id text not null,
  created_at timestamptz not null default now()
);

alter table public.gym_pdk_mapping enable row level security;
-- No policies — service-role only, same pattern as gym_kisi_mapping.

insert into public.gym_pdk_mapping (gym, organization_id, system_id)
values ('Fairford Leys', '6a283b987b3ae169a71b1f3e', 'fdbb9678-326a-4742-b329-7a9a743106bd');

-- One row per webhook delivery. raw_topic is PDK's own event topic
-- (currently only device.request.allowed/denied are subscribed to — see
-- the registration script — so this only ever needs to distinguish those
-- two, but stored raw rather than pre-interpreted in case the
-- subscription is ever widened later).
create table public.pdk_access_events (
  id bigint generated always as identity primary key,
  gym text not null references public.gym_pdk_mapping(gym),
  holder_name text,
  device_name text,
  raw_topic text not null,
  success boolean not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index pdk_access_events_gym_idx on public.pdk_access_events (gym, occurred_at desc);

alter table public.pdk_access_events enable row level security;
-- No policies — service-role only. Written by the webhook receiver
-- (verified via PDK's HMAC signature, not a user session — there is no
-- user session on an inbound webhook), read by whatever podHQ page later
-- surfaces this alongside/instead of the Kisi-based Access log.
