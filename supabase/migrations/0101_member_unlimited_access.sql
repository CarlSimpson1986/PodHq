-- Owner/staff accounts (e.g. Steve at Fairford Leys) need door access
-- without ever booking a session — a booking-gated unlock makes no sense
-- for someone who isn't a paying member using a slot. Scoped to the
-- member's own gym generally, not one hardcoded resource, so it covers
-- a gym with multiple resources (e.g. Hove's Gym + Wellness Room)
-- without needing a row per resource.
alter table public.members add column unlimited_access boolean not null default false;
