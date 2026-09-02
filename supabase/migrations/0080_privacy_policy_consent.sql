-- Privacy Policy acceptance tracking (2026-09-01, podhq-client's native
-- app work). The business's own Ts&Cs document repeatedly promises a
-- Privacy Policy "in Clause 26" that turns out not to exist in the
-- document at all — confirmed by reading the actual PDF, not assumed.
-- This adds a real one (src/lib/privacy-policy.ts, /privacy page) and a
-- signed record of acceptance, same non-null-timestamp-is-signed shape
-- as members.waiver_signed_at (0017) — required both for Health Connect
-- (Android requires a privacy policy before it'll grant health
-- permissions) and, per Carl, for insurance purposes around Pod Coach's
-- AI-generated coaching advice: proof a member explicitly consented,
-- not just that a policy existed somewhere.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.members
  add column if not exists privacy_policy_accepted_at timestamptz;
