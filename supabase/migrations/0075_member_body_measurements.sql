-- Weekly weigh-in / body measurements (2026-08-30) — member-entered,
-- optional per field (a member can log any subset). Deliberately NOT
-- part of member_wearable_data: that table is fully deleted the moment
-- a member disconnects their wearable (right-to-erasure behaviour) —
-- manually-entered measurements must survive that regardless.
create table if not exists public.member_body_measurements (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  recorded_date date not null,
  weight_kg numeric,
  waist_cm numeric,
  hip_cm numeric,
  created_at timestamptz not null default now(),
  unique (member_id, recorded_date)
);
