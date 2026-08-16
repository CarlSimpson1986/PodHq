-- Per-gym Resend config, 2026-08-16 — the user wants each gym on its own
-- Resend account with its own quota, not one shared account, so one gym's
-- volume can never eat into another's (Resend's free tier is a hard
-- 100/day cap, unlike Brevo's graceful next-day requeue — a shared account
-- across a growing franchise risks silently failing transactional emails,
-- e.g. booking confirmations). Same table shape as gym_brevo_config
-- (0036), same reasoning throughout: one row per gym, api_key_encrypted
-- via src/lib/crypto/secret-encryption.ts, admin-only entry (see /setup).
--
-- from_address/from_name are NOT secrets (they're visible in every email's
-- header) so they're stored in plain text, unlike the API key.
--
-- Read cross-app by podhq-client (src/lib/data/resend-config.ts) via the
-- shared service-role client, same pattern as gym_kisi_mapping — podHQ
-- owns the admin UI that writes this table, podhq-client only ever reads
-- it. A gym with no row yet falls back to podhq-client's existing shared
-- RESEND_API_KEY/RESEND_FROM_ADDRESS env vars rather than failing to send
-- at all — unlike Brevo's lead-sync (low-stakes, silently-skippable),
-- transactional emails (booking confirmations, password-adjacent flows)
-- are member-facing enough that "just don't send it" is the wrong default.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

create table if not exists public.gym_resend_config (
  id bigint generated always as identity primary key,
  gym text not null unique,
  api_key_encrypted text not null,
  from_address text not null,
  from_name text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.gym_resend_config enable row level security;

-- Same reasoning as gym_brevo_config/catalog_items/gym_kisi_mapping: no
-- policies at all correctly denies every client-side access by default —
-- both apps only ever read/write this via their service-role admin
-- client, after verifying the session/scope themselves.
