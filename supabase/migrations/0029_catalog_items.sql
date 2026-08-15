-- Live-editable catalog for credit packs & membership tiers (podHq's new
-- admin-only /admin/catalog page, 2026-08-15) — replaces the CREDIT_PACKAGES
-- / MEMBERSHIP_TIERS hardcoded arrays previously duplicated across podHq
-- and podhq-client. Both apps now read this one shared table. Modelled
-- after comparing against GymFlow's own Setup > Memberships/Credits pages,
-- scoped down from it deliberately: no per-gym pricing (this app has never
-- had that — one catalog for every gym, same as the arrays it replaces)
-- and no separate Web/App toggle (podhq-client is a single PWA surface,
-- there's no second native-app distribution channel to distinguish).
--
-- item_id is a stable slug, not the numeric id, matching what's already
-- stored as plain text in credits.reason='membership' rows' Stripe
-- metadata (tier_id) and in memberships.tier_id — seeded below with the
-- exact same slugs the old arrays used, so existing members' history keeps
-- resolving correctly against the new table.
--
-- Disable, not delete: a pack/tier that's since been turned off must stay
-- queryable for historical reference, same "deactivate over destroy"
-- reasoning as every other part of this app that deals with
-- possibly-referenced rows (Stage 9's admin deactivate, gym_outgoings
-- never allowing a category to vanish outright).
--
-- Price edits deliberately don't touch existing purchases/subscriptions —
-- Stripe's price_data bakes in a fixed price at signup/purchase time
-- regardless of what this table says later, so no extra migration logic
-- is needed for "existing members keep their old rate."
--
-- Safe to re-run: idempotent, matching every migration since 0001.

create table if not exists public.catalog_items (
  id bigint generated always as identity primary key,
  item_id text not null unique,
  type text not null check (type in ('credit_pack', 'membership')),
  name text not null,
  label text not null,
  credits integer not null check (credits > 0),
  price_gbp numeric not null check (price_gbp > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_items_type_idx on public.catalog_items (type, enabled);

alter table public.catalog_items enable row level security;

-- Same reasoning as gym_kisi_mapping/auth_events (Stage 10 audit): no
-- policies at all correctly denies every client-side access by default —
-- both apps only ever read/write this via their service-role admin client.
