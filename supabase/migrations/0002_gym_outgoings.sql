-- gym_outgoings — owner-submitted fixed running costs per gym, feeding the
-- Outgoings / P&L page (Stage 7). App-managed, not GymFlow-sourced.
--
-- Safe to re-run: every statement is idempotent, matching 0001.

-- ---------------------------------------------------------------------
-- gym_outgoings — "changing" a category's ongoing value means inserting a
-- new row with a later effective_from, not editing the old one: the most
-- recent row at or before a target month is that month's effective amount
-- for that category (see getEffectiveOutgoings). Deleting a row (0003) is
-- for removing an outright mistake, not for changing a rate going forward.
-- ---------------------------------------------------------------------
-- category is NOT constrained to the fixed list at the DB level — a CHECK
-- constraint listing values with "/" and "()" in it broke PostgREST's
-- schema-cache introspection for this table (HEAD requests worked, any
-- row-returning query failed with PGRST205, reproducibly). The app's own
-- validation (src/lib/validation/outgoings.ts, z.enum(OUTGOING_CATEGORIES))
-- is already the real guard against bad values — every insert goes through
-- it — so the DB constraint was redundant defense-in-depth, not load-bearing.
create table if not exists public.gym_outgoings (
  id bigint generated always as identity primary key,
  gym text not null,
  category text not null,
  amount_gbp numeric not null check (amount_gbp >= 0),
  effective_from text not null check (effective_from ~ $$^\d{4}-\d{2}$$),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists gym_outgoings_gym_category_idx
  on public.gym_outgoings (gym, category, effective_from desc);

alter table public.gym_outgoings enable row level security;

-- Plain (unquoted) policy names — quoted multi-word names round-tripped
-- fine everywhere else in this app's migrations, but given the
-- copy/paste quote-mangling hit while applying this file, plain
-- identifiers sidestep the risk entirely.
drop policy if exists select_own_gym_outgoings on public.gym_outgoings;
create policy select_own_gym_outgoings on public.gym_outgoings
  for select to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));

drop policy if exists insert_own_gym_outgoings on public.gym_outgoings;
create policy insert_own_gym_outgoings on public.gym_outgoings
  for insert to authenticated
  with check (gym in (select gym from public.users_gyms where user_id = auth.uid()));
