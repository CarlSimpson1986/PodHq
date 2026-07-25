-- PodHQ core schema: user/gym mapping, marketing spend, auth audit log,
-- API rate-limit counters, and RLS for every table holding gym data.
--
-- Run this once in the Supabase SQL Editor (or via `supabase db push` if
-- you adopt the CLI later). Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------
-- users_gyms — maps an auth user to the gym(s) they're allowed to see.
-- Admins get a single row with gym = NULL (role='admin' is checked
-- server-side and bypasses gym filtering entirely via the service key).
-- Owners get one row per gym they manage.
-- ---------------------------------------------------------------------
create table if not exists public.users_gyms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym text,
  role text not null check (role in ('admin', 'owner')),
  created_at timestamptz not null default now(),
  constraint owner_requires_gym check (role <> 'owner' or gym is not null)
);

create unique index if not exists users_gyms_user_gym_key
  on public.users_gyms (user_id, coalesce(gym, ''));

create index if not exists users_gyms_user_id_idx on public.users_gyms (user_id);

-- ---------------------------------------------------------------------
-- ad_spend — parsed weekly Meta Ads + GymFlow leads summaries.
-- ---------------------------------------------------------------------
create table if not exists public.ad_spend (
  id bigint generated always as identity primary key,
  gym text not null,
  week_starting date not null,
  spend_gbp numeric not null,
  clicks int not null default 0,
  leads int not null default 0,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists ad_spend_gym_week_idx on public.ad_spend (gym, week_starting);

-- ---------------------------------------------------------------------
-- auth_events — audit trail for every auth action, and the source of
-- truth for login rate limiting / account lockout counters.
-- ---------------------------------------------------------------------
create table if not exists public.auth_events (
  id bigint generated always as identity primary key,
  user_email text not null,
  user_id uuid references auth.users(id),
  event_type text not null check (event_type in (
    'login_success', 'login_failure', 'logout', 'magic_link_sent',
    'mfa_enrolled', 'mfa_challenge_success', 'mfa_challenge_failure',
    'account_locked'
  )),
  ip_address text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists auth_events_email_created_idx
  on public.auth_events (user_email, created_at desc);

-- ---------------------------------------------------------------------
-- rate_limits — sliding-window counters for the 100 req/min per-user
-- API limit. Rows older than a couple of windows can be purged by a
-- periodic job; not required for correctness.
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null,
  window_start timestamptz not null,
  request_count int not null default 1,
  unique (user_id, route, window_start)
);

create index if not exists rate_limits_lookup_idx
  on public.rate_limits (user_id, route, window_start);

-- ---------------------------------------------------------------------
-- Row Level Security — enabled on every table with gym or personal data.
-- The app never queries these tables from the browser; all reads go
-- through server-side API routes using the service-role key (which
-- bypasses RLS after we've checked role/gym ourselves). These policies
-- exist as defense-in-depth in case of key leakage or a future
-- direct-from-client query.
-- ---------------------------------------------------------------------

alter table public."Revenue" enable row level security;
alter table public.attendance enable row level security;
alter table public.users_gyms enable row level security;
alter table public.ad_spend enable row level security;
alter table public.auth_events enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists "select own gyms" on public."Revenue";
create policy "select own gyms" on public."Revenue"
  for select to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));

drop policy if exists "select own gyms" on public.attendance;
create policy "select own gyms" on public.attendance
  for select to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));

drop policy if exists "select own row" on public.users_gyms;
create policy "select own row" on public.users_gyms
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "select own gym ad_spend" on public.ad_spend;
create policy "select own gym ad_spend" on public.ad_spend
  for select to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));

drop policy if exists "insert own gym ad_spend" on public.ad_spend;
create policy "insert own gym ad_spend" on public.ad_spend
  for insert to authenticated
  with check (gym in (select gym from public.users_gyms where user_id = auth.uid()));

-- auth_events and rate_limits have no policies for `authenticated` —
-- only the service role (which bypasses RLS) may read or write them.
