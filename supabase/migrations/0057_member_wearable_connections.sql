-- Member-linked wearable connections (Fitbit via Google Health API) —
-- 2026-08-24. Two tables, same shape/reasoning as gym_resend_config
-- (0037): dedicated table per concern rather than a bare column-add
-- (this is a token/secret, not a plain reference id like
-- members.stripe_customer_id), RLS enabled with zero policies — both
-- apps only ever read/write this via the service-role admin client,
-- after verifying the session/member themselves. podhq-client owns both
-- read and write here (unlike gym_resend_config, where podHq writes and
-- podhq-client only reads) — it's the one running the OAuth
-- connect/callback/disconnect flow and the daily sync cron.
--
-- refresh_token_encrypted uses the same AES-256-GCM
-- SECRET_ENCRYPTION_KEY convention as gym_resend_config.api_key_encrypted
-- (src/lib/crypto/secret-encryption.ts, ported into podhq-client with
-- both encrypt/decrypt since it's the sole owner of this data).
--
-- provider is a plain text column, TS-union validated (not DB-CHECK) —
-- same "twice burned by Supabase's SQL Editor mangling a CHECK
-- constraint's string literal on paste" reasoning as pod_resources and
-- everywhere else in this schema. Only 'fitbit' today; future-proofs for
-- Whoop/Oura without a schema change.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

create table if not exists public.member_wearable_connections (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade unique,
  provider text not null default 'fitbit',
  refresh_token_encrypted text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.member_wearable_connections enable row level security;

-- One row per synced day per member — recorded_date is the day the data
-- is *for*, not when the sync ran, so a re-sync of the same day upserts
-- instead of duplicating (see the unique constraint below).
create table if not exists public.member_wearable_data (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  recorded_date date not null,
  steps integer,
  sleep_minutes integer,
  resting_heart_rate integer,
  synced_at timestamptz not null default now(),
  unique (member_id, recorded_date)
);

alter table public.member_wearable_data enable row level security;
