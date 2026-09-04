-- Manual "I worked out anyway" tick for Today's Tasks' Workout row
-- (podhq-client, 2026-09-03) — only ever relevant on a day with no
-- booked session; a booked session's own workout_sessions completion
-- status is the source of truth there and this table plays no part in
-- that case. Same insert-only, one-row-per-day convention as habit_logs/
-- gym_cardio_equipment's member_cardio_logs (see 0070/0076) — no update
-- statement anywhere, "done today" is just "does a row exist for
-- (member_id, log_date)". Undo (same-day only, mirrors habit_logs'
-- deliberate exception) deletes the row rather than storing a
-- done/undone flag.
create table if not exists public.member_workout_manual_logs (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  log_date date not null,
  created_at timestamptz not null default now(),
  unique (member_id, log_date)
);

create index if not exists member_workout_manual_logs_member_date_idx
  on public.member_workout_manual_logs (member_id, log_date);

alter table public.member_workout_manual_logs enable row level security;

drop policy if exists select_own_workout_manual_logs on public.member_workout_manual_logs;
create policy select_own_workout_manual_logs on public.member_workout_manual_logs
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
