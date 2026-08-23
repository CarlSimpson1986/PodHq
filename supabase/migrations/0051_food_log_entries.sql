-- Nutrition logging (podhq-client, Hove AI Coach Stage 7) — one row per
-- logged food item. Calories/macros stored denormalized at log time
-- (computed from the food's per-100g values x quantity_g), same
-- reasoning as workout_exercises denormalizing name/muscle_group rather
-- than re-joining a live catalog (0049): a food's macros shouldn't
-- retroactively change a day already logged just because an upstream
-- database entry gets corrected. meal/source are plain text, not DB
-- CHECK-constrained, same convention as coach_profiles (0048) — validated
-- via TS unions in podhq-client instead.

create table if not exists public.food_log_entries (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  logged_date date not null,
  meal text not null,
  food_name text not null,
  brand text,
  quantity_g numeric not null,
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  source text not null,
  created_at timestamptz not null default now()
);

create index if not exists food_log_entries_member_date_idx
  on public.food_log_entries (member_id, logged_date);

alter table public.food_log_entries enable row level security;

drop policy if exists select_own_food_log_entries on public.food_log_entries;
create policy select_own_food_log_entries on public.food_log_entries
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
