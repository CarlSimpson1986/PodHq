-- Daily habit checklist (podhq-client) — scoped via questions across two
-- sessions (2026-08-28 scoping, confirmed + built 2026-08-29): a new
-- Dashboard card, deliberately separate from the existing weekly "Your
-- habit" card on /coach (coach_profiles-adjacent check-in flow, unchanged)
-- rather than replacing it. Both a member-typed custom habit and a
-- recommended one (recommended list lives in podhq-client code, same
-- "content list = code, not DB" convention as EXERCISE_CATALOG — Carl's
-- the only one who'd ever manage it) land in the same member_habits table.

create table if not exists public.member_habits (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  name text not null,
  -- TS-union validated ('checkbox' | 'counted'), not DB CHECK-constrained —
  -- same convention as coach_profiles' text columns (0048's own comment).
  habit_type text not null,
  -- Only meaningful when habit_type = 'counted' (e.g. "8 glasses of
  -- water" -> target_count 8); null for checkbox habits.
  target_count int,
  -- Soft-archive, not delete — a member dropping a habit shouldn't erase
  -- its history in habit_logs below, same "never destroy history"
  -- reasoning as Founding Member's discount flag being cleared, not the
  -- membership row deleted.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_habits_member_idx on public.member_habits (member_id);

alter table public.member_habits enable row level security;

drop policy if exists select_own_member_habits on public.member_habits;
create policy select_own_member_habits on public.member_habits
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));

-- One row per tick, not a mutable running total — same "row existence =
-- happened" insert-only convention as check_ins/food_log_entries (see
-- training-blocks.ts's own comment, written before this table existed,
-- anticipating this exact name). A checkbox habit's day is "done" once
-- one row exists for (habit_id, log_date); a counted habit's day total is
-- count(*) for that (habit_id, log_date) — no stored running count to
-- keep in sync, no update statement anywhere in this feature.
--
-- One deliberate, narrow exception to pure insert-only: the app layer
-- allows deleting a *same-day* row (undo an accidental tap / a
-- miscounted +1) — never a past day's. That's a UX necessity a checklist
-- fundamentally needs that check-ins/training-blocks/food-log don't, not
-- a reason to abandon the convention for historical days.
create table if not exists public.habit_logs (
  id bigint generated always as identity primary key,
  habit_id bigint not null references public.member_habits(id),
  member_id bigint not null references public.members(id),
  log_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists habit_logs_habit_date_idx on public.habit_logs (habit_id, log_date);
create index if not exists habit_logs_member_date_idx on public.habit_logs (member_id, log_date);

alter table public.habit_logs enable row level security;

drop policy if exists select_own_habit_logs on public.habit_logs;
create policy select_own_habit_logs on public.habit_logs
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
