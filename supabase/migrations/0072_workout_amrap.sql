-- AMRAP ("As Many Rounds As Possible") custom workouts (podhq-client,
-- Stage 2 of the CrossFit-style custom-format work, 2026-08-29 — see
-- podhq-client's ROADMAP.md). Rounds-For-Time (Stage 3) will reuse these
-- same columns; not built yet.
--
-- format: TS-union validated ('straight_sets' | 'amrap'), same
-- not-DB-CHECK-constrained convention as every other status/mode text
-- column in this schema (0048's own comment). Defaults to the existing
-- behaviour so every current row/generation path is unaffected.
--
-- An AMRAP session has no discrete logged sets (it's one continuous
-- circuit, not N sets per exercise) — time_cap_seconds/rounds_completed/
-- partial_round_exercise_index/partial_round_reps live on
-- workout_sessions instead, captured once at the end via the member's own
-- self-reported tally (same self-report trust posture as RPE/weight
-- everywhere else in this app — no rep-counting sensors).
--
-- duration_seconds on workout_sets: a circuit exercise is prescribed as
-- EITHER reps_target OR duration_seconds, never both (e.g. "20 kettlebell
-- swings" vs "40 seconds of plank hold") — enforced in application code,
-- not a DB constraint, same convention as this table's other columns.
-- reps_target's NOT NULL (0049) has to go for that: a duration-based set
-- genuinely has no rep count, same "blank, not a guessed placeholder"
-- reasoning as 0068's weight_target_kg NOT NULL drop.

alter table public.workout_sessions add column if not exists format text not null default 'straight_sets';
alter table public.workout_sessions add column if not exists time_cap_seconds int;
alter table public.workout_sessions add column if not exists rounds_completed int;
alter table public.workout_sessions add column if not exists partial_round_exercise_index int;
alter table public.workout_sessions add column if not exists partial_round_reps int;

alter table public.workout_sets add column if not exists duration_seconds int;
alter table public.workout_sets alter column reps_target drop not null;
