-- Custom-workout builder gets a per-exercise rest field (podhq-client,
-- Stage 1 of the CrossFit-style custom-format work, 2026-08-29 — see
-- podhq-client's ROADMAP.md). Straight-sets custom workouts only: the
-- member picks their own rest per exercise instead of the app's assumed
-- REST_SECONDS_BY_BLOCK values, which drive the workout screen's rest
-- timer between sets. Null for every non-custom exercise (default/focus
-- generation never sets it) and for a custom exercise the member left at
-- the builder's default — no rest-timer screen shown in either case,
-- same "member self-paces" behaviour as today.

alter table public.workout_exercises add column if not exists rest_seconds int;
