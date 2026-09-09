-- Native FCM push tokens (2026-09-09, podhq-client) — separate from
-- push_subscriptions (browser Web Push: endpoint/p256dh/auth). The native
-- Android app (Capacitor, server.url mode loading myfitpod.app in a system
-- WebView, not Chrome) doesn't reliably deliver background Web Push the way
-- an installed Chrome PWA does, so it registers a real FCM device token via
-- @capacitor/push-notifications instead. Kept as its own table rather than
-- widening push_subscriptions' NOT NULL columns, since the two delivery
-- paths (web-push protocol vs. Firebase Admin SDK send) need different data
-- shapes and are sent to independently in src/lib/push/send.ts.
--
-- Same "service-role only, no RLS policies" convention as push_subscriptions.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

create table if not exists public.push_device_tokens (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id),
  fcm_token text not null unique,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  created_at timestamptz not null default now()
);

alter table public.push_device_tokens enable row level security;
/* No policies - service-role only. */
