-- Rounds-For-Time (Stage 3) custom workouts (podhq-client — see its
-- ROADMAP.md). Follows 0072_workout_amrap.sql's own forward note.
--
-- format: 'rounds_for_time' is the third value of the same TS-union
-- validated ('straight_sets' | 'amrap' | 'rounds_for_time'), same
-- not-DB-CHECK-constrained convention as every other status/mode column.
--
-- Reused from 0072, unchanged meaning: rounds_completed (v1 has no DNF,
-- so always written equal to target_rounds once the member taps
-- "Finished!" — read server-side from this session's own row, never
-- client-submitted). time_cap_seconds / partial_round_exercise_index /
-- partial_round_reps are AMRAP-only and stay null for every RFT row.
--
-- New for RFT: target_rounds is the prescription (set at generation,
-- RFT's analogue of time_cap_seconds). elapsed_seconds is the result
-- (written at completion, RFT's analogue of rounds_completed) — the one
-- genuinely new "result" concept, since AMRAP's countdown clock never
-- needs to measure a stopped duration.

alter table public.workout_sessions add column if not exists target_rounds int;
alter table public.workout_sessions add column if not exists elapsed_seconds int;
