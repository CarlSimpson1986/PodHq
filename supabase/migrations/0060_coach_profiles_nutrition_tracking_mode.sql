-- Which Nutrition tab view a member sees (podhq-client, 2026-08-25
-- redesign) — 'calorie_counting' (the existing detailed diary, unchanged)
-- or 'hand_portions' (a simpler palm/cupped-hand/thumb count derived from
-- the same food_log_entries totals, see src/lib/coach/portions.ts).
-- Text, not DB CHECK-constrained — same TS-union-validation convention as
-- every other coach_profiles text column (0048's own comment).
alter table public.coach_profiles
  add column if not exists nutrition_tracking_mode text not null default 'calorie_counting';
