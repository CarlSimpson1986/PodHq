-- Emergency contact info (podhq-client, 2026-09-14). Pods are unstaffed —
-- the only safety mechanism today is the member dialling 999 themselves or
-- pressing the facility's own Emergency Button (src/lib/waiver-terms.ts).
-- Neither helps if a member is unable to act. Optional, nullable: nobody
-- is required to provide this to use the app.

alter table public.members
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;
