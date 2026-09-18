-- Follow-up to 0098, same session: the webhook subscription had to move
-- from "one per gym, scoped to that gym's own org" to a single
-- dealer-level subscription with scope 'recursive' — PDK's API returned
-- 403 "must have direct access to the specified organization" when
-- posting to FairfordLeys' own child org (these credentials only have
-- direct access at the dealer level, confirmed live 2026-09-18), and a
-- non-recursive array-of-cloud-node-ids scope turned out to only support
-- cloud-node-category events, not device.request.allowed/denied.
--
-- A single recursive subscription delivers events from every child org
-- to one shared URL, so the webhook route can no longer tell gyms apart
-- via the URL path (see 0098's now-abandoned /api/pdk/webhook/[gym])  —
-- it has to resolve gym from the payload's own cloudNodeId instead.
alter table public.gym_pdk_mapping add column cloud_node_id text unique;

update public.gym_pdk_mapping
set cloud_node_id = '29659376-c88e-4ad0-9717-d25ec42420d9'
where gym = 'Fairford Leys';

alter table public.gym_pdk_mapping alter column cloud_node_id set not null;
