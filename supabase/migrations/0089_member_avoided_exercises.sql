-- Persistent per-member "never suggest this again" exercise exclusion.
-- Mirrors member_workout_manual_logs (0083): admin-client-only writes,
-- select-only RLS policy, no soft-delete — removing a row is "un-avoid".
create table if not exists public.member_avoided_exercises (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  exercise_key text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (member_id, exercise_key)
);

alter table public.member_avoided_exercises enable row level security;

create policy select_own_avoided_exercises on public.member_avoided_exercises
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
