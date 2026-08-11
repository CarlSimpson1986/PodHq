-- Performance: auth_events is queried on every single login/signup/reset
-- attempt (podhq-client's checkLoginLockout, checkAuthActionRateLimit —
-- see src/lib/auth/lockout.ts) but the only existing index is
-- (user_email, created_at desc), which doesn't cover the event_type filter
-- every one of those queries also applies, and there is no index at all on
-- ip_address despite it being filtered on every IP-based check — a full
-- table scan on every auth attempt as this table grows. Additive only,
-- doesn't touch or replace the existing index (podHq's own auth flows may
-- still rely on the plain user_email+created_at shape).
--
-- Safe to re-run: idempotent.

create index if not exists auth_events_email_type_created_idx
  on public.auth_events (user_email, event_type, created_at desc);

create index if not exists auth_events_ip_type_created_idx
  on public.auth_events (ip_address, event_type, created_at desc);
