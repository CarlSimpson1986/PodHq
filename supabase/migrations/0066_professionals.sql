-- "Find a Professional" — personal trainer directory, 2026-08-27. Carl
-- wants a Solo60-style marketplace: a searchable directory of trainer
-- profiles (photo, specialties, favourite gyms, price/hour) with an
-- inquiry form (goals/budget/availability), not instant slot booking.
-- Starts with placeholder/mock profiles — real trainers get entered via
-- this app's new /professionals admin page once recruited.
--
-- professionals: the directory itself. Managed only from this app's
-- admin page — a single-operator business, same reasoning as
-- help_faq_items (0063) for why this is franchisor-level admin-only
-- data rather than per-gym owner-editable.
--
-- professional_inquiries: every "More information" request a member
-- sends. Persisted (not just emailed) so Carl has a real history to
-- review from the admin page, same reasoning as
-- help_chat_unanswered_questions (0063) for logging rather than only
-- notifying.
--
-- RLS enabled, no policies on either table — same "service-role client
-- only, after an app-level session/role check" convention as
-- help_faq_items/catalog_items/gym_kisi_mapping elsewhere in this
-- file's own migration history. specialties/gyms are text[] with no
-- CHECK constraint — validated at the API boundary with zod instead,
-- same convention 0056_pod_resources_equipment.sql established for
-- tag-shaped columns. Safe to re-run: idempotent, matching every
-- migration since 0001.

create table if not exists public.professionals (
  id bigint generated always as identity primary key,
  name text not null,
  photo_url text,
  bio text not null default '',
  qualifications text not null default '',
  specialties text[] not null default '{}',
  gyms text[] not null default '{}',
  price_per_hour_gbp numeric(10, 2) not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists professionals_active_idx
  on public.professionals (active, display_order);

alter table public.professionals enable row level security;

create table if not exists public.professional_inquiries (
  id bigint generated always as identity primary key,
  professional_id bigint not null references public.professionals(id) on delete cascade,
  member_id bigint not null references public.members(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists professional_inquiries_professional_id_idx
  on public.professional_inquiries (professional_id);

alter table public.professional_inquiries enable row level security;
