-- "Why did this change?" explainability (Carl, 2026-09-06, from competitor
-- research — the #1 recurring complaint across Fitbod/Future/Zing/JSA was
-- weight targets that felt random because the reasoning behind them was
-- never shown). Stores the deterministic reason generate-workout.ts's own
-- RPE-adjustment rule already computes — never a guessed or LLM-authored
-- explanation, just a plain-English readout of the real rule that ran.
-- Nullable: null for a first-time exercise (no prior history to explain
-- against) or a member's own custom/circuit pick (member-entered weight,
-- nothing to explain).
alter table public.workout_exercises
  add column if not exists weight_change_reason text;
