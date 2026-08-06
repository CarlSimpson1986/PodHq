-- Enables permanently deleting a franchisee's auth account (admin panel
-- "Delete permanently" action) while keeping their audit trail. Without
-- this, auth_events.user_id's default NO ACTION FK blocks deleteUser
-- outright for any account with login history (see 0005's note on the
-- same class of bug) — SET NULL lets the row disappear from auth.users
-- while the auth_events rows survive with user_id nulled out, preserving
-- event_type/email/timestamp instead of erasing the history.
-- Split into two statements (rather than one comma-chained ALTER TABLE,
-- as 0005 used) after a paste into the Supabase SQL Editor lost the
-- leading "alter table" line and left a bare "drop constraint" as the
-- first token — each statement here is self-contained, so a partial
-- paste fails obviously instead of silently merging with stray content.
alter table public.auth_events
  drop constraint auth_events_user_id_fkey;

alter table public.auth_events
  add constraint auth_events_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;
