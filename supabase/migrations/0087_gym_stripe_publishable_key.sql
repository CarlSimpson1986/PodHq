-- Closes the embedded-checkout gap flagged in 0086's session (see
-- ROADMAP_HISTORY.md, 2026-09-05): a standalone gym (Hove/Berryfields) has
-- its own real Stripe account, but sell-panel.tsx's embedded Checkout only
-- ever loads Stripe.js with the shared platform publishable key — correct
-- for Stripe Connect (a stripeAccount header on the platform key), wrong
-- for a genuinely separate standalone account, which needs its own
-- publishable key client-side, not just its own secret key server-side.
--
-- Not encrypted, unlike api_key_encrypted/webhook_secret_encrypted above —
-- a publishable key is meant to be public (it ships to the browser on
-- every checkout), so encrypting it at rest would add nothing.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.gym_stripe_config
  add column if not exists publishable_key text;
