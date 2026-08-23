-- Training-block periodization (podhq-client, Hove beta, Stage 12) — one
-- row per confirmed block transition, not per week/day. No "pending" row
-- is ever written: same "row existence = happened" convention as
-- check_ins (0054). A member with zero rows is implicitly in their first
-- block — hypertrophy, anchored to coach_profiles.created_at (the same
-- cadence-anchor field check-ins already uses) — computed in
-- src/lib/coach/training-block-state.ts, never backfilled here. The
-- *current* block for any member is simply the most recent row by
-- started_at, or the implicit Block 1 if none exists. block_type is
-- plain text, not DB CHECK-constrained — same TS-union-validation
-- convention as coach_profiles.goal/experience_level (0048).

create table if not exists public.training_blocks (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  block_type text not null,
  started_at timestamptz not null default now()
);

create index if not exists training_blocks_member_idx
  on public.training_blocks (member_id, started_at desc);

alter table public.training_blocks enable row level security;

-- member_id is a direct FK to members(id) — same single-join shape as
-- check_ins/coach_profiles/workout_sessions, not the deeper
-- workout_sessions -> workout_exercises -> workout_sets join chain those
-- child tables need. Select-own only; all writes go through
-- createAdminClient() server-side.
drop policy if exists select_own_training_blocks on public.training_blocks;
create policy select_own_training_blocks on public.training_blocks
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
