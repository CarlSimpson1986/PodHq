-- leads — individual leads from the GymFlow leads export (Marketing page),
-- alongside the existing weekly lead *count* in ad_spend (Stage 8) — that
-- count still drives CPL, this table is for knowing who the leads actually
-- are. App-managed, sourced from a franchisee-uploaded CSV.
--
-- Safe to re-run: every statement is idempotent, matching 0001/0002.

-- ---------------------------------------------------------------------
-- lead_source_id is GymFlow's own "Lead ID" column — a real per-lead
-- identifier, used as the upsert conflict target so re-uploading a leads
-- export (the same overlapping-weeks scenario ad_spend already handles)
-- overwrites the same lead rather than duplicating it, same pattern as
-- ad_spend_gym_week_key in 0004.
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  gym text not null,
  lead_source_id text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  created_date timestamptz not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists leads_gym_lead_source_id_key
  on public.leads (gym, lead_source_id);

create index if not exists leads_gym_created_date_idx
  on public.leads (gym, created_date desc);

alter table public.leads enable row level security;

-- Select + insert only, matching ad_spend (0001) — all real writes go
-- through the service-role admin client (bypasses RLS), so an `authenticated`
-- update policy is never actually exercised; these exist as defense-in-depth
-- only, same reasoning as everywhere else in this schema.
drop policy if exists select_own_gym_leads on public.leads;
create policy select_own_gym_leads on public.leads
  for select to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));

drop policy if exists insert_own_gym_leads on public.leads;
create policy insert_own_gym_leads on public.leads
  for insert to authenticated
  with check (gym in (select gym from public.users_gyms where user_id = auth.uid()));
