-- Lead nurture for member-app signups — 2026-10-04 (shared DB, podhq-client
-- writes these). Carl's rule: a lead is anyone who signed up in the app;
-- their first real purchase makes them a member and the nurture emails
-- stop. Staff comps/grants don't count as a purchase. No backfill —
-- existing signups never ticked consent, so none are added to Brevo.
--
-- marketing_consent_at: when they ticked the (unticked-by-default) "email
--   me tips and offers" box at signup. Null = no marketing emails. Booking
--   confirmations, receipts etc. are service emails and don't depend on it.
-- brevo_lead_synced_at: when they were added to their gym's Brevo list
--   (on email confirmation, only if consent was given). Claimed atomically
--   before the Brevo call so a double callback can't add twice; cleared
--   again if the call fails so the next sign-in retries.
-- first_purchase_at: first real Stripe purchase (pack, membership, gift
--   voucher). Set once; a member with this set is never added as a lead,
--   and setting it removes them from the Brevo list if they were on it.
alter table public.members
  add column marketing_consent_at timestamptz,
  add column brevo_lead_synced_at timestamptz,
  add column first_purchase_at timestamptz;
