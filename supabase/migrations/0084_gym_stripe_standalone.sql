-- Standalone Stripe support for owned (non-franchisee) gyms, 2026-09-04 —
-- Hove is Carl's own gym, not a franchisee, so it doesn't need Stripe
-- Connect at all: it gets its own real Stripe account and its own key,
-- used directly rather than via the platform's stripeAccount header.
-- Franchisee gyms keep using the existing stripe_account_id/
-- onboarding_complete columns (Connect) — this adds two new nullable
-- columns to the same table rather than a separate one, since it's still
-- "a gym's own Stripe config", same unique-per-gym shape either way.
--
-- api_key_encrypted/webhook_secret_encrypted follow the exact pattern
-- already established by gym_resend_config/gym_brevo_config —
-- src/lib/crypto/secret-encryption.ts, admin-only entry via /setup.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.gym_stripe_config
  add column if not exists api_key_encrypted text,
  add column if not exists webhook_secret_encrypted text;
