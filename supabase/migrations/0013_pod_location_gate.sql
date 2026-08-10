-- Location-gated pod unlock (Stage 7) — matches GymFlow's own existing
-- proximity requirement for general door access (GPS-based, hard gate,
-- confirmed by the business owner as the accepted standard for the whole
-- facility, not just the pod). Not tamper-proof (self-reported device
-- GPS, spoofable like any client-side location), but consistent with
-- what already protects the rest of the building.
--
-- Safe to re-run: every statement is idempotent, matching 0001-0012.

alter table public.gym_kisi_mapping
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists unlock_radius_meters integer not null default 300;

-- Aylesbury Berryfields — Unit 4, Goodchild Parkway, Sir Henry Lee Cres,
-- Aylesbury HP18 0PE. Radius left at the default (300m), matching Kisi's
-- own default geofence restriction distance.
update public.gym_kisi_mapping
set latitude = 51.831694, longitude = -0.858231
where gym = 'Aylesbury Berryfields';

-- pod_access_events gains the reported location + computed distance for
-- every unlock attempt (successful, Kisi-failed, or location-blocked) —
-- same audit-everything reasoning as the existing kisi_response column.
alter table public.pod_access_events
  add column if not exists reported_latitude numeric,
  add column if not exists reported_longitude numeric,
  add column if not exists distance_meters numeric;
