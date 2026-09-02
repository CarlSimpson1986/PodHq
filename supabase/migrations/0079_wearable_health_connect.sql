-- Health Connect as a second member_wearable_connections provider
-- (2026-09-01, podhq-client's native Android app). Unlike Fitbit
-- (server-side OAuth, a refresh token the daily cron uses to pull from
-- Google Health API), Health Connect data lives entirely on-device —
-- there is no cloud token to store. The native app itself reads it via
-- the Capacitor Health plugin and POSTs daily snapshots to
-- /api/wearables/health-connect/sync, which upserts into
-- member_wearable_data exactly like the Fitbit cron does (see
-- saveWearableSnapshot in src/lib/data/wearables.ts — already
-- provider-agnostic, no change needed there).
--
-- refresh_token_encrypted was NOT NULL because every provider until now
-- needed one. A Health Connect connection row still gets created (its
-- mere existence is what getWearableConnection/getRecoveryStatus key
-- off of to know a source is connected), just with a null token —
-- there's nothing to encrypt when the OS holds the permission grant,
-- not this app.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.member_wearable_connections
  alter column refresh_token_encrypted drop not null;
