-- POD guided tour (podhq-client): a scripted first-login walkthrough of the
-- home screen, replayable afterward via a persistent "?" button. Nullable
-- timestamp rather than a boolean so we know *when* a member completed it,
-- not just whether — useful if the tour content changes later and we want
-- to know who saw the old version.
alter table public.members
  add column if not exists tour_completed_at timestamptz;
