-- get_credit_balance — sums a member's credit ledger in Postgres instead
-- of the app pulling every row over the wire and summing in JS
-- (getCreditBalance in podhq-client's src/lib/data/member.ts). credits is
-- an append-only ledger (0009_pod_booking.sql) — one row per booking,
-- purchase, and membership renewal, so a long-tenured member's row count
-- grows without bound. PostgREST silently truncates any single request at
-- 1000 rows with no error (documented in this file's own Data pipeline
-- section as a real historical incident against Revenue/attendance) —
-- against a ledger that would mean a genuinely wrong balance, not just an
-- incomplete list, once a member's history gets long enough. This
-- function returns a single number regardless of ledger size, the same
-- pattern create_booking() already uses internally for its own balance
-- check.
--
-- Safe to re-run: create or replace.

create or replace function public.get_credit_balance(p_member_id bigint)
returns integer
language sql
stable
as $$
  select coalesce(sum(amount), 0)::integer
  from public.credits
  where member_id = p_member_id;
$$;
