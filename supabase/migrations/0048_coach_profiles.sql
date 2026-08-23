-- AI Coach onboarding profile (podhq-client, Hove beta) — one row per
-- member, separate from the members table itself, matching the existing
-- members/memberships split rather than bolting more columns onto
-- members. goal/experience_level are plain text, not DB CHECK-constrained
-- — same reasoning as pod_resources.credit_type and waitlist_entries.status
-- elsewhere in this schema (this codebase has twice been burned by
-- Supabase's SQL Editor mangling a CHECK constraint's string literal on
-- paste): validated via a TS union in podhq-client instead
-- (src/lib/coach/types.ts).
create table if not exists public.coach_profiles (
  id bigint generated always as identity primary key,
  member_id bigint not null unique references public.members(id),
  goal text not null,
  experience_level text not null,
  injuries text,
  sessions_per_week smallint not null,
  weight_kg numeric,
  height_cm numeric,
  age smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_profiles enable row level security;

-- Same pattern as every other member-owned table (e.g. members itself):
-- RLS exists for defense in depth, but this app's actual authorization
-- check is always the caller's verified session + createAdminClient(),
-- never auth.uid() alone (documented token-refresh timing gap).
drop policy if exists select_own_coach_profile on public.coach_profiles;
create policy select_own_coach_profile on public.coach_profiles
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
