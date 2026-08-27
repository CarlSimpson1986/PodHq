-- Persistent Hypertrophy A/B/C workout rotation, 2026-08-27. Carl:
-- realistically pod members train up to ~3x/week, so the default
-- should stay full-body per session, but the exercise *selection*
-- should repeat as a consistent "Workout A/B/C" for the length of a
-- training-block phase (blockPhaseIndex() in podhq-client's
-- generate-workout.ts, currently 4 weeks) instead of being picked
-- fresh every single session the way it is today.
--
-- workout_templates: exactly 3 rows (letters A/B/C) generated once per
-- (member, block, phase) the first time a session is generated in that
-- phase — mirrors the lazy/idempotent pattern workout_sessions already
-- uses per-booking (0049), just one level up.
--
-- Keyed on block_type + block_started_at, NOT a training_blocks.id FK —
-- a member's "current block" is very often the *implicit* default
-- (hypertrophy, anchored to coach_profiles.created_at) with no real
-- training_blocks row at all (see podhq-client's training-block-state.ts
-- comment: "no row is ever written just to represent this", same
-- row-existence-means-happened convention as check_ins). A hard FK here
-- would fail for exactly that common case. block_started_at is always
-- available either way (real row or implicit default) and is already
-- the sole input blockPhaseIndex() uses, so it's the natural key.
--
-- workout_template_exercises: the fixed exercise list for one template,
-- copied into a real workout_sessions/workout_exercises row (weights
-- and rep targets still computed live at that point — only exercise
-- *selection* becomes fixed, not the RPE-driven progression).
--
-- template_id on workout_sessions records which template (and so which
-- letter) a given booking actually used — both for display and for
-- computing "which letter is next" (count existing sessions against
-- this phase's 3 template ids, next letter = count mod 3).
--
-- RLS enabled, no policies — same "service-role client only, after an
-- app-level session check" convention as every other podhq-client-facing
-- table (see 0049, 0063 for precedent). Safe to re-run: idempotent,
-- matching every migration since 0001.

create table if not exists public.workout_templates (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  block_type text not null,
  block_started_at timestamptz not null,
  phase_index smallint not null,
  letter text not null,
  created_at timestamptz not null default now(),
  unique (member_id, block_started_at, phase_index, letter)
);

create index if not exists workout_templates_lookup_idx
  on public.workout_templates (member_id, block_started_at, phase_index);

alter table public.workout_templates enable row level security;

create table if not exists public.workout_template_exercises (
  id bigint generated always as identity primary key,
  template_id bigint not null references public.workout_templates(id) on delete cascade,
  exercise_key text not null,
  name text not null,
  muscle_group text not null,
  sort_order smallint not null
);

create index if not exists workout_template_exercises_template_id_idx
  on public.workout_template_exercises (template_id);

alter table public.workout_template_exercises enable row level security;

alter table public.workout_sessions
  add column if not exists template_id bigint references public.workout_templates(id) on delete set null;
