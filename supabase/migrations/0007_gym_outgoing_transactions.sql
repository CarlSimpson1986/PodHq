-- gym_outgoing_transactions — per-transaction detail behind a bank-statement
-- CSV import (Outgoings page). App-managed, not GymFlow-sourced.
--
-- Safe to re-run: every statement is idempotent, matching 0001/0002.

-- ---------------------------------------------------------------------
-- gym_outgoings (0002) stores one row per category per month — the right
-- shape for a recurring bill (rent, wages) that shouldn't need re-entering
-- every month, but it throws away *who* a payment was to/from. A bank CSV
-- import still collapses into that same monthly total for the P&L figures,
-- but every individual transaction that made up the total is kept here too,
-- so a one-off like "HMRC" or a named person inside an otherwise-recurring
-- category isn't lost — this table is purely for that drill-down/audit
-- view, it never feeds the P&L math itself.
--
-- category is deliberately NOT constrained at the DB level, same reasoning
-- as gym_outgoings.category (see 0002) — app-layer z.enum validation only.
-- ---------------------------------------------------------------------
create table if not exists public.gym_outgoing_transactions (
  id bigint generated always as identity primary key,
  gym text not null,
  transaction_date date not null,
  description text not null,
  amount_gbp numeric not null check (amount_gbp >= 0),
  category text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists gym_outgoing_transactions_gym_date_idx
  on public.gym_outgoing_transactions (gym, transaction_date desc);

alter table public.gym_outgoing_transactions enable row level security;

drop policy if exists select_own_gym_outgoing_transactions on public.gym_outgoing_transactions;
create policy select_own_gym_outgoing_transactions on public.gym_outgoing_transactions
  for select to authenticated
  using (gym in (select gym from public.users_gyms where user_id = auth.uid()));

drop policy if exists insert_own_gym_outgoing_transactions on public.gym_outgoing_transactions;
create policy insert_own_gym_outgoing_transactions on public.gym_outgoing_transactions
  for insert to authenticated
  with check (gym in (select gym from public.users_gyms where user_id = auth.uid()));
