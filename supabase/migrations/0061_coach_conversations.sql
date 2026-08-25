-- Coach chat history (podhq-client, 2026-08-25 redesign) — one row per
-- member, messages appended as a jsonb array rather than one row per
-- message: this chat has no need to query/join individual messages (no
-- search, no per-message moderation queue), so a single growing document
-- is simpler than a child table, same reasoning check_ins.answers already
-- uses for free-form structured data.
create table if not exists public.coach_conversations (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) unique,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.coach_conversations enable row level security;

drop policy if exists select_own_coach_conversations on public.coach_conversations;
create policy select_own_coach_conversations on public.coach_conversations
  for select to authenticated
  using (member_id in (select id from public.members where auth_user_id = auth.uid()));
