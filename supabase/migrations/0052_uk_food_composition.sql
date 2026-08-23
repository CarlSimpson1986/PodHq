-- UK generic-food nutrition reference data (podhq-client, Hove AI Coach
-- Stage 7 food search) — replaces an earlier USDA FoodData Central plan
-- after Carl asked "why USDA? what about England?" (2026-08-23). This is
-- Public Health England's own McCance & Widdowson's Composition of Foods
-- Integrated Dataset (CoFID), a static downloadable spreadsheet (no live
-- API exists for it), imported once via a one-off seed script — see
-- 0053_uk_food_composition_seed.sql and ROADMAP.md's Stage 7 entry. Free,
-- no API key, no rate limit, no third-party outage risk for this half of
-- food search — a real architecture improvement over the USDA plan, not
-- just a UK-flavoured substitute.
--
-- Reference data, not member data — no RLS select policy needed (every
-- read goes through createAdminClient() server-side, same shape as
-- catalog_items, 0029). At ~2,900 rows a plain ilike scan is fast enough
-- with no specialised index — this table is small and static.

create table if not exists public.uk_food_composition (
  id bigint generated always as identity primary key,
  food_name text not null,
  calories_per_100g numeric not null,
  protein_per_100g numeric not null,
  carbs_per_100g numeric not null,
  fat_per_100g numeric not null
);

alter table public.uk_food_composition enable row level security;
-- Deliberately no policies — see comment above.
