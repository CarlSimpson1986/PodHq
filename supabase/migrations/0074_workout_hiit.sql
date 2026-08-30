-- HIIT interval timer, 4th custom-workout format (Cardio) — see
-- podhq-client's ROADMAP.md. Follows the same "reuse what already
-- exists" convention 0073 (RFT) itself followed: target_rounds
-- (prescribed round count), rounds_completed and elapsed_seconds
-- (result, written at completion — HIIT always completes every
-- prescribed round in v1, no DNF, so rounds_completed is always
-- written equal to target_rounds) are all reused unchanged.
--
-- Only genuinely new concept: the interval prescription itself.
-- work_seconds / rest_seconds are per-exercise interval durations
-- (distinct from workout_exercises.rest_seconds, which is the
-- straight-sets per-exercise rest-between-sets timer on a different
-- table — not the same thing, despite the similar name).
-- rest_between_rounds_seconds is the longer pause after a full lap of
-- the exercise list, before the next round starts (skipped after the
-- final round — enforced client- and server-side, not a stored flag).
alter table public.workout_sessions add column if not exists work_seconds int;
alter table public.workout_sessions add column if not exists rest_seconds int;
alter table public.workout_sessions add column if not exists rest_between_rounds_seconds int;
