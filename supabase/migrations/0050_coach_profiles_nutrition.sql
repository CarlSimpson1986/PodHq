-- Nutrition-relevant onboarding fields (podhq-client, Hove beta) — added
-- after the decision to front-load the entire AI Coach onboarding in one
-- pass rather than asking again when the nutrition feature itself ships.
-- meal_count_preference/food_preferences are plain text, not DB
-- CHECK-constrained, same reasoning as coach_profiles' other text columns
-- (0048). Nutrition itself (meal plans, macro targets) stays out of scope
-- for this beta — this is data collection only, ahead of the feature.
alter table public.coach_profiles
  add column if not exists meal_count_preference smallint,
  add column if not exists food_allergies text,
  add column if not exists food_preferences text;
