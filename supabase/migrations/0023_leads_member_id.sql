-- Links an app-native lead row (podhq-client signup) to the member it
-- became — nullable because every CSV-imported row (0008_leads.sql) has no
-- member to link to and stays null forever. No CHECK constraint — same
-- "validate in the app, not a hand-pasted DB constraint" lesson as
-- 0021/0022 already established.

alter table public.leads
  add column if not exists member_id bigint references public.members(id);

-- Partial: only app-native rows are ever looked up by member_id — every
-- CSV-imported row stays null forever and is never queried this way.
create index if not exists leads_member_id_idx
  on public.leads (member_id) where member_id is not null;
