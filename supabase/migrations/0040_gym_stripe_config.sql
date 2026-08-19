-- Per-gym Stripe Connect config, 2026-08-19 — the user wants each gym on
-- its own Stripe account (own balance, own payouts, franchisees able to
-- refund their own clients directly) rather than one shared platform
-- account across the whole franchise. Piloted on Hove first (not yet
-- open, lowest-risk gym to get wrong).
--
-- Standard connected accounts, created fresh via Connect Onboarding (not
-- OAuth-link-existing — Hove has no pre-existing Stripe account). Direct
-- charges: podhq-client's checkout routes create the Checkout Session
-- against the gym's own connected account via Stripe's per-call
-- `stripeAccount` request option, so money and processing fees land there
-- directly, not on the platform account.
--
-- stripe_account_id is NOT a secret (visible in Stripe's own Dashboard UI
-- to anyone with account access) unlike gym_resend_config/gym_brevo_
-- config's api_key_encrypted — no encryption needed here.
--
-- Read cross-app by podhq-client (checkout routes + webhook) and by
-- podHq's own refund route, via the shared service-role client, same
-- pattern as gym_kisi_mapping/gym_resend_config — podHQ owns the admin UI
-- that writes this table (see /setup), both apps only ever read it after
-- that (except podHq's own onboarding-status write-back on return from
-- Stripe's hosted onboarding flow).
--
-- A gym with no row here falls back to the shared platform account
-- (STRIPE_SECRET_KEY in podhq-client, unchanged) exactly as every gym
-- behaves today — not a breaking change for anyone but Hove.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

create table if not exists public.gym_stripe_config (
  id bigint generated always as identity primary key,
  gym text not null unique,
  stripe_account_id text not null,
  onboarding_complete boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.gym_stripe_config enable row level security;

-- Same reasoning as gym_resend_config/gym_brevo_config/gym_kisi_mapping:
-- no policies at all correctly denies every client-side access by
-- default — both apps only ever read/write this via their service-role
-- admin client, after verifying the session/scope themselves.
