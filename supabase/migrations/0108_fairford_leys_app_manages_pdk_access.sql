-- Fairford Leys: our app takes members back out of PDK's Booking Access
-- group after their slot, same as Hove (0107) — 2026-10-16.
--
-- 0107 left this off at Fairford Leys because GymFlow manages that group
-- there (adds a member for their booking, removes them after — the group
-- is empty between bookings, Carl confirmed 2026-10-16). But our unlock
-- route also adds members to the group (on their first unlock, and on a
-- retry), and with this off nothing ever removed them — an app member
-- would have kept door access indefinitely.
--
-- Turning it on only ever removes holders our app itself recorded in
-- pdk_access_grants; anyone GymFlow added is never touched. Carl's call:
-- a member who books through our app has stopped using GymFlow, so the
-- one overlap case (the same person also holding a GymFlow booking at that
-- moment) isn't expected.
update public.gym_pdk_mapping
set app_manages_access_group = true
where gym = 'Fairford Leys';

-- Sanity check — expect both PDK gyms true.
select gym, app_manages_access_group
from public.gym_pdk_mapping
order by gym;
