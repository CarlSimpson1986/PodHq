-- Year-to-date total volume lifted, for the new Progress page's
-- cumulative headline stat ("You've lifted 80,000kg this year") —
-- podhq-client, 2026-09-01.
--
-- A plain SQL aggregate, not a JS sum over fetched rows like
-- getLifetimeWorkoutStats' 26-week window uses: a full calendar year of
-- sets for an active member can genuinely exceed PostgREST's 1000-row
-- response cap (CLAUDE.md's Data pipeline note — the same risk that
-- forced getLifetimeWorkoutStats' window down to 26 weeks in the first
-- place, restated here since this function has to cover the *whole*
-- year, not a bounded rolling window). Aggregating in Postgres itself
-- sidesteps the cap entirely — no rows ever cross the PostgREST
-- boundary, just the one already-summed number.
--
-- reps_actual * weight_actual_kg is NULL (not 0) for a set with either
-- field unset, and SUM() ignores NULLs — bodyweight-only entries (no
-- weight logged) are correctly excluded with no separate format filter
-- needed.
--
-- Safe to re-run: idempotent (create or replace), matching every
-- migration since 0001.

create or replace function public.get_year_to_date_volume_kg(p_member_id bigint)
returns numeric
language sql
stable
as $$
  select coalesce(sum(ws.reps_actual * ws.weight_actual_kg), 0)
  from public.workout_sets ws
  join public.workout_exercises we on we.id = ws.exercise_id
  join public.workout_sessions s on s.id = we.session_id
  where s.member_id = p_member_id
    and s.status = 'completed'
    and s.created_at >= date_trunc('year', now())
$$;
