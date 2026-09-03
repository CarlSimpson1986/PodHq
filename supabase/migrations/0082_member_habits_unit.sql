-- Adds a unit to counted habits (podhq-client, 2026-09-03) — "Drink
-- water" target_count 8 with no unit anywhere meant a member saw a bare
-- "0/8" with no idea what it counted (glasses? litres?). Nullable, only
-- meaningful when habit_type = 'counted', same convention as
-- target_count itself (see 0070_daily_habits.sql).
alter table public.member_habits add column if not exists unit text;
