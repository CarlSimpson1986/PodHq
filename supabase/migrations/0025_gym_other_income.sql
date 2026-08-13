-- gym_other_income — franchisee-submitted non-GymFlow income per gym,
-- feeding both the Outgoings/P&L net figure and a separate "Other income"
-- line on /revenue. App-managed, deliberately kept out of the "Revenue"
-- table itself — Revenue is 100% GymFlow-pipeline-sourced with zero manual
-- writes anywhere in this app's history, and its per-customer/category
-- calculations (LTV, top customers, category pie) key on sold_to/category
-- fields that don't map onto things like vending commission or room rental.
--
-- Same append-only carry-forward convention as gym_outgoings for recurring
-- categories: "changing" an ongoing value means inserting a new row with a
-- later effective_from, not editing the old one. One-off categories are
-- looked up for the exact month only (see RECURRING_INCOME_CATEGORIES in
-- src/lib/data/types.ts and the branching in src/lib/data/other-income.ts) —
-- a variable income category with no row for a given month means £0 that
-- month, not a carried-forward stale figure.
--
-- category is NOT constrained to the fixed list at the DB level, same
-- reasoning as gym_outgoings (0002): the app's own validation
-- (src/lib/validation/other-income.ts, z.enum(OTHER_INCOME_CATEGORIES)) is
-- the real guard on every insert; a DB-level CHECK is redundant
-- defense-in-depth that has previously broken PostgREST's schema-cache
-- introspection for punctuation-heavy category strings.
--
-- Safe to re-run: every statement is idempotent, matching 0001/0002.

create table if not exists public.gym_other_income (
  id bigint generated always as identity primary key,
  gym text not null,
  category text not null,
  label text,
  amount_gbp numeric not null check (amount_gbp >= 0),
  effective_from text not null check (effective_from ~ $$^\d{4}-\d{2}$$),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists gym_other_income_gym_category_idx
  on public.gym_other_income (gym, category, effective_from desc);

alter table public.gym_other_income enable row level security;

-- Plain (unquoted) policy names — same rationale as gym_outgoings' policies:
-- sidesteps the smart-quote copy/paste corruption that broke an earlier
-- migration's quoted, punctuation-heavy identifiers.
drop policy if exists select_own_gym_other_income on public.gym_other_income;
create policy select_own_gym_other_income on public.gym_other_income
  for select to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));

drop policy if exists insert_own_gym_other_income on public.gym_other_income;
create policy insert_own_gym_other_income on public.gym_other_income
  for insert to authenticated
  with check (gym in (select gym from public.users_gyms where user_id = auth.uid()));

drop policy if exists delete_own_gym_other_income on public.gym_other_income;
create policy delete_own_gym_other_income on public.gym_other_income
  for delete to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));
