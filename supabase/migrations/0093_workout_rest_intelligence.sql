-- Full "rest timer + intelligent adjustment" loop (2026-09-07, podhq-client).
-- Three columns: workout_sets.rest_actual_seconds captures what a member
-- actually rested (vs. workout_exercises.rest_seconds, the prescribed
-- value, which already existed from 0071 but was never populated for
-- AI-generated exercises, only custom-built ones); workout_exercises
-- gains rest_change_reason, the same "plain-English readout of the exact
-- rule that ran" pattern weight_change_reason (0088) already established;
-- workout_sessions gains started_at, stamped once when a member actually
-- enters the active workout (distinct from created_at, which is plan
-- generation time — could be hours before the real session starts) so the
-- overall session timer survives an app close/reopen mid-session instead
-- of resetting to zero.
--
-- Also workout_sessions.duration_feedback (same session, added before this
-- migration was ever applied — Carl: "how was your workout — too long, too
-- short, just right — and then for the next workout it auto adjusts").
-- Self-reported once at session completion. Corrected mid-build, after
-- this comment was first written: it does NOT touch exercise count or
-- which exercises get picked — Carl's explicit requirement is that core
-- compound lifts always stay and always keep progressing. The real lever
-- is accessory (isCompound: false) exercises' own set count
-- (setsForExercise in generate-workout.ts): too long -> 2 sets next time,
-- too short -> 4, just right/no feedback -> the standard 3. Same
-- single-step-from-the-last-real-signal shape as the rest/weight rules.
-- Not DB-CHECK-constrained — same "validated via a TS union instead"
-- reasoning as credits.reason and friends (see 0024_waitlist.sql's own
-- comment), this project's established pattern after being burned twice
-- by the SQL Editor mangling a CHECK constraint's string literal on
-- paste.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.workout_sets
  add column if not exists rest_actual_seconds smallint;

alter table public.workout_exercises
  add column if not exists rest_change_reason text;

alter table public.workout_sessions
  add column if not exists started_at timestamptz;

alter table public.workout_sessions
  add column if not exists duration_feedback text;
