-- Access onboarding (podhq-client Stage 10) — adds the profile fields a
-- member must complete before the physical door Unlock is enabled: mobile
-- number, gender, address, and a signed waiver (typed full name + a
-- timestamp — the timestamp being non-null IS "signed", no separate
-- boolean needed). All nullable: an existing member (e.g. the pilot
-- account) simply reads as "not yet complete" until they fill these in,
-- no backfill required.
--
-- Safe to re-run: idempotent.

alter table public.members
  add column if not exists mobile_number text,
  add column if not exists gender text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists address_city text,
  add column if not exists address_postcode text,
  add column if not exists waiver_signed_name text,
  add column if not exists waiver_signed_at timestamptz;

-- No CHECK constraint on gender — same reasoning as gym_outgoings.category
-- (0002) and ad_spend's category-less design: validated at the app layer
-- via a fixed option list, not the DB, so adding an option later never
-- needs a migration.
