-- Per-gym Brevo email-marketing config, 2026-08-16 — each franchisee has
-- their own Brevo account (own business name, own sender email), not one
-- shared account with per-gym lists as src/lib/marketing/brevo.ts's
-- GYM_BREVO_LIST_IDS map previously assumed. One row per gym; a gym with no
-- row yet simply has no Brevo config, same "silently skip" behaviour Stage
-- 13's lead-sync already has for an unmapped gym.
--
-- api_key_encrypted holds ciphertext only (AES-256-GCM via
-- src/lib/crypto/secret-encryption.ts, keyed by the server-only
-- SECRET_ENCRYPTION_KEY env var) — never plaintext, so a raw DB read/leak
-- doesn't hand out a working Brevo key. Decrypted only server-side, at the
-- point of calling Brevo's API; the Setup UI never receives the real key
-- back, only a masked indicator.
--
-- No CHECK constraint on gym, same reasoning as users_gyms/gym_outgoings
-- elsewhere in this project — validated app-side against GYM_NAMES
-- (src/lib/data/types.ts), not at the DB layer.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

create table if not exists public.gym_brevo_config (
  id bigint generated always as identity primary key,
  gym text not null unique,
  api_key_encrypted text not null,
  list_id integer not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.gym_brevo_config enable row level security;

-- Same reasoning as catalog_items/gym_kisi_mapping/auth_events: no policies
-- at all correctly denies every client-side access by default — this app
-- only ever reads/writes it via the service-role admin client, after
-- verifying the session and gym scope itself.
