-- Weekly AI Coach check-ins (podhq-client, Hove beta, Stage 10b) — one
-- row per completed check-in, fixed weekly cadence (every Sunday — Carl's
-- call, 2026-08-23: "so they can get motivated for Monday") computed in
-- src/lib/coach/checkin-state.ts, not stored here. No "pending" row is
-- ever inserted: same "row existence = happened" convention as
-- food_log_entries, so due/not-due is derived purely from the most
-- recent completed_at, never a status column.
--
-- answers is deliberately schemaless jsonb, not a normalized
-- check_in_answers(question_key, answer) table — the actual check-in
-- question set isn't decided yet (Carl's call to make later: "we'll
-- discuss check-in questions later"), and a fixed set of question_key
-- columns/rows would force a migration every time that content changes.
-- RLS is row-level regardless of column type, so this doesn't weaken
-- select-own access at all. Revisit as a normalized table only if/when
-- per-answer querying (reporting, trends) becomes a real requirement.

create table if not exists public.check_ins (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  period_start date not null,
  period_end date not null,
  completed_at timestamptz not null default now(),
  answers jsonb not null default '{}'::jsonb
);

create index if not exists check_ins_member_idx
  on public.check_ins (member_id, completed_at desc);

alter table public.check_ins enable row level security;

drop policy if exists select_own_check_ins on public.check_ins;
create policy select_own_check_ins on public.check_ins
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
