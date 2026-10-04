-- PDK goes live at Hove (Brighton) — 2026-10-04. Follow-up to 0098, which
-- deliberately seeded only Fairford Leys until its webhook was proven end
-- to end (it has been, since 2026-09-23).
--
-- IDs from the PDK dashboard URLs for Hove's three readers (main entrance,
-- gym, recovery room), as copied by Carl: /systems/<system_id>/configuration/<cloud_node_id>/
-- devices/<device_id> — the same system / cloud-node / device triple the
-- virtual-read API path uses (src/lib/pdk.ts). Organization ID was already
-- confirmed live 2026-09-18 (see 0098's own comment).
--
-- The mapping row is what lets the shared dealer-level webhook resolve a
-- Hove door event (by cloud_node_id) and what Door Traffic's monthly sync
-- iterates over — without it, both silently skip Hove.
insert into public.gym_pdk_mapping (gym, organization_id, system_id, cloud_node_id)
values (
  'Hove',
  '6aa8ddf8cafcae7027083667',
  '70a04963-fee6-47b7-bb44-e5ebcf288332',
  'f6c50eaf-6454-49e7-809b-116ea2c61362'
);

-- Hove's two resources have been access_provider='pdk' since 0038 but
-- never had a door to unlock. Each gets its own room's reader as
-- deviceId, plus the shared main-entrance reader as entranceDeviceId —
-- Hove members go through the main door first, then the gym or recovery
-- room door. Carl's call 2026-10-04: two separate, always-visible buttons
-- on the booking ("Open main door" / "Open <room> door") rather than one
-- button that guesses which door comes next — at an unmanned site the
-- member just taps the door they're standing at. Both buttons share the
-- booking's own unlock window, so a 14:00 recovery booking can't open the
-- recovery door before 13:55 even if the member is already inside.
update public.pod_resources
set provider_config = jsonb_build_object(
  'systemId', '70a04963-fee6-47b7-bb44-e5ebcf288332',
  'cloudNodeId', 'f6c50eaf-6454-49e7-809b-116ea2c61362',
  'deviceId', '38a6c809-745a-4a09-82dd-4923a9f8db77',
  'entranceDeviceId', 'be628730-fde7-4445-beab-9f6c490a7653'
)
where gym = 'Hove'
  and resource_key = 'gym';

update public.pod_resources
set provider_config = jsonb_build_object(
  'systemId', '70a04963-fee6-47b7-bb44-e5ebcf288332',
  'cloudNodeId', 'f6c50eaf-6454-49e7-809b-116ea2c61362',
  'deviceId', 'ddbd48b0-e810-409b-9c32-90c0dca2aebb',
  'entranceDeviceId', 'be628730-fde7-4445-beab-9f6c490a7653'
)
where gym = 'Hove'
  and resource_key = 'wellness';

-- Sanity check — expect two rows, each with all four IDs.
select id, resource_key, label, access_provider, provider_config
from public.pod_resources
where gym = 'Hove';
