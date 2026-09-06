-- Manual pre-workout readiness check (sleep/soreness/energy), the
-- no-wearable equivalent of the wearable-driven recovery signal.
-- sleep_quality/soreness/energy are "low"|"medium"|"high" — TS-union
-- validated at the API boundary, same convention as coach_profiles'
-- text columns (no DB CHECK constraint).
create table if not exists public.workout_readiness_checks (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.workout_sessions(id) on delete cascade,
  member_id bigint not null references public.members(id) on delete cascade,
  sleep_quality text not null,
  soreness text not null,
  energy text not null,
  created_at timestamptz not null default now(),
  unique (session_id)
);

alter table public.workout_readiness_checks enable row level security;

create policy select_own_readiness_checks on public.workout_readiness_checks
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
