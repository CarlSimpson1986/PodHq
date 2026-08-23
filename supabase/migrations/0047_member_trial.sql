-- 7-day free AI Coach trial (podhq-client), Hove beta. Three nullable
-- timestamps rather than one boolean, matching tour_completed_at's
-- reasoning (0045) — each stamp answers a different question:
--   trial_activated_at — member tapped "Start my free trial" on the
--     preview screen. Does NOT start the clock.
--   trial_started_at   — the clock actually started: their first booking
--     made after activating. Gated on this being null so it only ever
--     fires once, regardless of how many bookings follow.
--   trial_expires_at    — trial_started_at + 7 days, stamped at the same
--     time as trial_started_at rather than computed on every read.
alter table public.members
  add column if not exists trial_activated_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz;
