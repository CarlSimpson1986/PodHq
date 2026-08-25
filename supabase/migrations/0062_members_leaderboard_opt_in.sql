-- Multi-site leaderboard opt-in (podhq-client, 2026-08-25) — off by
-- default. Nobody's name/attendance/steps appears to other members
-- (including at other gyms) until they explicitly turn this on; the
-- leaderboard itself is still viewable by anyone, opted-in or not, they
-- just don't appear in it until they join. See src/lib/coach/leaderboard.ts.
alter table public.members
  add column if not exists leaderboard_opt_in boolean not null default false;
