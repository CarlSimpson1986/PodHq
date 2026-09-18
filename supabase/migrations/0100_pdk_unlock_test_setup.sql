-- Test scaffolding for the first real end-to-end PDK unlock, same session
-- as 0098/0099. members.pdk_holder_id is the real mapping the future
-- booking-integration write-side will need generally (see the session's
-- own design discussion — GymFlow currently manages this via dynamic
-- "Booking Access" group membership; podHQ has no equivalent yet), not
-- a throwaway column — just populated manually here rather than through
-- that not-yet-built automation.
alter table public.members add column pdk_holder_id text;

-- Carl's own test account (member 157, signed up 2026-09-15 for Hove) —
-- moved to Fairford Leys and linked to the PDK test holder created
-- directly in PDK's dashboard today (Carl Simpson, in the "Booking
-- Access" group, active 2026-09-17 to 2026-09-19).
update public.members
set gym = 'Fairford Leys',
    pdk_holder_id = 'd2d70845-8bc8-4ff5-b9c0-a587ea849701'
where id = 157;

-- Fairford Leys' first pod_resource — no lat/long yet (deliberately: the
-- unlock route's GPS gate only applies when a resource has coordinates,
-- see unlock/route.ts's own comment, so this stays testable before
-- Fairford Leys' real location is entered as part of actually onboarding
-- it as a podHQ-booked gym). device/cloud-node/system IDs confirmed live
-- via the API today — see 0098's own comment for how.
insert into public.pod_resources
  (gym, resource_key, label, credit_type, slot_duration_minutes, access_provider, provider_config, pod_capacity, open_hour, close_hour)
values (
  'Fairford Leys', 'pod', 'Gym', 'pod', 60, 'pdk',
  jsonb_build_object(
    'systemId', 'fdbb9678-326a-4742-b329-7a9a743106bd',
    'cloudNodeId', '29659376-c88e-4ad0-9717-d25ec42420d9',
    'deviceId', '7befe549-eed7-4004-a66f-96fd8baa8082'
  ),
  1, 0, 24
);
