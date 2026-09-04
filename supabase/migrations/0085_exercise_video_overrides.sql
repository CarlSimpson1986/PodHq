-- Carl's own exercise-technique videos, 2026-09-04 — replaces third-party
-- YouTube clips (see src/lib/coach/exercise-catalog.ts in podhq-client)
-- one exercise at a time as Carl films real footage, rather than a big-bang
-- migration of the whole catalog. Looked up by exercise_key, which must
-- match a `key` in podhq-client's static EXERCISE_CATALOG exactly — no FK
-- possible, that catalog isn't a DB table.
--
-- Public bucket (not signed URLs for playback) — these are plain technique
-- demo clips, no sensitivity, and a public bucket's objects are served
-- directly without RLS on storage.objects at all. Uploads happen via a
-- short-lived signed *upload* URL created server-side with the
-- service-role client (src/lib/data/exercise-videos.ts) — that path
-- doesn't need a storage.objects INSERT policy either, the signed token
-- itself is the authorization.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

create table if not exists public.exercise_video_overrides (
  id bigint generated always as identity primary key,
  exercise_key text not null unique,
  video_path text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

alter table public.exercise_video_overrides enable row level security;

-- No policies at all — both apps only ever read/write this via their
-- service-role admin client, same pattern as every other admin-managed
-- table (gym_resend_config, catalog_items, etc.).

insert into storage.buckets (id, name, public)
values ('exercise-videos', 'exercise-videos', true)
on conflict (id) do nothing;
