-- Day-to-day/occupational activity level (podhq-client, 2026-08-29) —
-- separate from sessions_per_week, which is for training-block
-- *programming* only (Carl's call: "session per week is more for
-- programming"). This alone drives the TDEE activity multiplier in
-- nutrition-targets.ts — sessions_per_week has zero calorie contribution
-- (Carl, same day: a single pod session doesn't move the needle enough to
-- warrant "eating it back", and that habit is a well-known way people
-- undermine a deficit). Nullable, no default — same "missing = can't
-- compute a target yet" convention
-- convention as weight_kg/height_cm/age (0048's own comment): an
-- existing profile from before this column existed just won't have a
-- nutrition target until the member fills this in via the profile edit
-- form, rather than silently guessing an activity level on their behalf.
alter table public.coach_profiles
  add column if not exists daily_activity_level text;
