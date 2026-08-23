-- AI Coach workout data (podhq-client, Hove beta) — generated when a
-- premium/trial member books a session (see podhq-client's
-- POST /api/member/workout/generate, Stage 4), logged during the active
-- session including per-set RPE. status/exercise fields are plain text,
-- not DB CHECK-constrained, same reasoning as coach_profiles (0048).

create table if not exists public.workout_sessions (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  booking_id bigint references public.bookings(id),
  resource_id bigint references public.pod_resources(id),
  status text not null default 'generated',
  created_at timestamptz not null default now()
);

-- One workout per booking — a member re-opening the same booked session
-- must not silently generate a second plan.
create unique index if not exists workout_sessions_booking_key
  on public.workout_sessions (booking_id) where booking_id is not null;

create index if not exists workout_sessions_member_idx
  on public.workout_sessions (member_id, created_at desc);

alter table public.workout_sessions enable row level security;

drop policy if exists select_own_workout_sessions on public.workout_sessions;
create policy select_own_workout_sessions on public.workout_sessions
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));

create table if not exists public.workout_exercises (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.workout_sessions(id),
  exercise_key text not null,
  name text not null,
  muscle_group text not null,
  sort_order smallint not null
);

create index if not exists workout_exercises_session_idx
  on public.workout_exercises (session_id, sort_order);

alter table public.workout_exercises enable row level security;

drop policy if exists select_own_workout_exercises on public.workout_exercises;
create policy select_own_workout_exercises on public.workout_exercises
  for select to authenticated
  using (
    session_id in (
      select ws.id from public.workout_sessions ws
      join public.members m on m.id = ws.member_id
      where m.auth_user_id = auth.uid()
    )
  );

create table if not exists public.workout_sets (
  id bigint generated always as identity primary key,
  exercise_id bigint not null references public.workout_exercises(id),
  set_number smallint not null,
  reps_target smallint not null,
  weight_target_kg numeric not null,
  reps_actual smallint,
  weight_actual_kg numeric,
  -- 1-5: Effortless/Easy/Just Right/Hard/Killer — the post-set RPE check
  -- (MyFitPod-App-Brief.docx section 9, added this session). Feeds the
  -- next session's weight suggestion for this exercise; see
  -- src/lib/coach/generate-workout.ts.
  rpe smallint,
  completed_at timestamptz
);

create index if not exists workout_sets_exercise_idx
  on public.workout_sets (exercise_id, set_number);

alter table public.workout_sets enable row level security;

drop policy if exists select_own_workout_sets on public.workout_sets;
create policy select_own_workout_sets on public.workout_sets
  for select to authenticated
  using (
    exercise_id in (
      select we.id from public.workout_exercises we
      join public.workout_sessions ws on ws.id = we.session_id
      join public.members m on m.id = ws.member_id
      where m.auth_user_id = auth.uid()
    )
  );
