-- Continuous-improvement loop for podhq-client's "POD" help chat
-- (src/lib/help-bot.ts there), 2026-08-26. Two tables:
--
-- help_faq_items: the FAQ moves from a static code array
-- (podhq-client's old src/lib/faq.ts) into the DB, editable from this
-- app's new /chat-questions admin page — franchisor-level (admin-only
-- writes), since one answer here changes what the bot tells members at
-- every gym, not just one.
--
-- help_chat_unanswered_questions: every question the bot couldn't answer
-- from the FAQ/Terms & Conditions gets logged here (podhq-client's
-- help-chat route inserts via its own service-role client, same
-- cross-app pattern staff-recipients.ts already uses to read
-- users_gyms). Denormalizes gym directly onto the row (not just via
-- member_id) so a queue query never needs to join back to members,
-- same reasoning as bookings/credits.
--
-- RLS enabled, no policies on either table — same "service-role client
-- only, after an app-level session/role check" convention as
-- gym_brevo_config/catalog_items/gym_kisi_mapping elsewhere in this
-- file's own migration history. Safe to re-run: idempotent, matching
-- every migration since 0001.

create table if not exists public.help_faq_items (
  id bigint generated always as identity primary key,
  question text not null,
  answer text not null,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.help_faq_items enable row level security;

create table if not exists public.help_chat_unanswered_questions (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  gym text not null,
  question text not null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  faq_item_id bigint references public.help_faq_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists help_chat_unanswered_questions_gym_idx
  on public.help_chat_unanswered_questions (gym);

-- Partial index — the review queue's own query is always "this gym's
-- *unresolved* questions", and resolved rows accumulate indefinitely.
create index if not exists help_chat_unanswered_questions_unresolved_idx
  on public.help_chat_unanswered_questions (gym)
  where resolved_at is null;

alter table public.help_chat_unanswered_questions enable row level security;
