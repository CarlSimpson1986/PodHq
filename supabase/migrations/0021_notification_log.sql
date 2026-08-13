-- notification_log — audit trail for every transactional/staff-alert email
-- send attempt (sent or failed), from podhq-client's new src/lib/notifications/
-- module. Same role for outbound email as auth_events already plays for
-- auth actions and pod_access_events for door unlocks.
--
-- event_type/status are plain text, deliberately with NO check constraint —
-- this codebase has hit that exact wall twice already: gym_outgoings.category's
-- CHECK constraint caused a real outage (Supabase's SQL editor silently
-- mangles smart quotes on paste, corrupting the constraint's string literal),
-- and auth_events.event_type's own CHECK was later dropped for the same
-- reason (0006_auth_events_lockout_reset.sql). Validated at the app layer via
-- a TypeScript union (src/lib/notifications/types.ts) instead.
--
-- member_id is nullable: staff alerts and the gym-owner recipient of any
-- alert don't resolve to a single member row.
--
-- Deliberately zero RLS policies, same reasoning as auth_events/
-- pod_access_events/rate_limits: denies all client-side access by default,
-- service-role is the only writer/reader — sending is always server-side.

create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  event_type text not null,
  recipient_email text not null,
  member_id bigint references public.members(id),
  status text not null,
  provider_message_id text,
  error_detail text,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_recipient_created_idx
  on public.notification_log (recipient_email, created_at desc);

create index if not exists notification_log_event_type_idx
  on public.notification_log (event_type, created_at desc);

alter table public.notification_log enable row level security;
-- No policies — service-role only, same as auth_events/pod_access_events.
