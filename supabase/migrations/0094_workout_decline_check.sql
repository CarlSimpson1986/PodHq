-- Decline-detection (2026-09-08, podhq-client) — a single nullable column,
-- workout_sessions.decline_alert_exercise_key: the catalog key of a compound
-- lift whose e1RM (Epley: weight_actual_kg * (1 + reps_actual / 30)) has been
-- non-increasing across its last 3 real appearances (with at least one
-- genuine decrease) while RPE hasn't eased off over the same window — see
-- decline-detection.ts for the full rule. Computed once at session
-- generation and persisted (same "computed once, never recomputed on read"
-- pattern as weight_change_reason/rest_change_reason), not a live query on
-- every page load. Null for every session with no qualifying decline, which
-- is the overwhelming majority.
--
-- No CHECK constraint — a real catalog exercise key, validated in app code
-- against EXERCISE_CATALOG, same "TS union / app-level validation instead
-- of a DB constraint" convention as duration_feedback (0093) and friends.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.workout_sessions
  add column if not exists decline_alert_exercise_key text;
