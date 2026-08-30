-- Cardio equipment logging (2026-08-30) — gym staff name their cardio
-- machines here (podHq's /setup); members log which one they used here
-- (podhq-client), counting toward Today's Mission. RLS enabled, zero
-- policies — both apps only ever read/write via their service-role
-- admin client, same convention as catalog_items (0029).
create table if not exists public.gym_cardio_equipment (
  id bigint generated always as identity primary key,
  gym text not null,
  name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gym_cardio_equipment enable row level security;

-- Insert-only ticks, same convention as habit_logs (0070) — one row per
-- log, no stored completion flag; "done today" is count(*) for
-- (member_id, log_date). A member can log more than one machine/session
-- per day.
create table if not exists public.member_cardio_logs (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  equipment_id bigint not null references public.gym_cardio_equipment(id),
  log_date date not null,
  created_at timestamptz not null default now()
);
alter table public.member_cardio_logs enable row level security;
