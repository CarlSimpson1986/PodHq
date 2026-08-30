-- Security-audit fix (2026-08-30): member_body_measurements (0075) was the
-- sole table in the schema created without RLS enabled. Both apps only ever
-- touch it via the service-role admin client (which bypasses RLS
-- regardless), so there's no active exploit path today, but every other
-- table pairs its `create table` with this exact statement — zero policies,
-- blocking any future accidental anon/authenticated-role access as
-- defense-in-depth. This closes that gap. Safe to re-run.
alter table public.member_body_measurements enable row level security;
