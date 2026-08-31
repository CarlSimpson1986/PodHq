-- Pod Assist (2026-08-31) — owner/admin-facing analytics chat agent over
-- the existing src/lib/data/* read functions (tool-calling, not
-- text-to-SQL — see src/lib/assist/tools.ts). RLS enabled, zero policies,
-- same convention as gym_cardio_equipment (0076): only ever read/written
-- via the service-role admin client, gym scope enforced server-side in
-- application code before any query runs, never trusted from the model.

-- One row per chat turn. tool_calls logs exactly what the agent actually
-- queried (tool name + resolved gym, not the model's raw input) — this is
-- what the security-leakage eval asserts against: an owner's row must
-- never show a gym other than their own, regardless of what the question
-- asked for.
create table if not exists public.assist_query_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  gym text,
  role text not null check (role in ('admin', 'owner')),
  question text not null,
  tool_calls jsonb not null default '[]'::jsonb,
  answer text,
  latency_ms integer,
  tokens_in integer,
  tokens_out integer,
  cost_gbp numeric,
  created_at timestamptz not null default now()
);
alter table public.assist_query_log enable row level security;

-- Proactive monthly digest (Vercel Cron, first scheduled job in the app) —
-- generated once per gym per completed report month, shown unprompted on
-- next login rather than waiting to be asked. Unique constraint prevents
-- the cron re-running mid-month from producing duplicates.
create table if not exists public.assist_digests (
  id bigint generated always as identity primary key,
  gym text not null,
  report_month text not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (gym, report_month)
);
alter table public.assist_digests enable row level security;
