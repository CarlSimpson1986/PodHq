-- Per-gym catalog pricing (revised same-day, 2026-08-15) — 0029/0030 built
-- catalog_items as one shared list for every gym, but Setup is owner-only
-- (each franchisee manages their own gym's packs/tiers; "admin" means the
-- franchisor specifically, not a general staff-elevated role, and pricing
-- is a per-gym decision, not a franchisor one). A single owner editing a
-- shared row would have changed every other gym's prices too, so this
-- makes the catalog gym-scoped instead: item_id is now unique per gym, not
-- globally.
--
-- The 14 rows 0030 seeded are deleted and re-seeded per gym in
-- 0032_catalog_items_per_gym_seed.sql — safe to do right now because
-- catalog_items is never referenced by foreign key from credits/
-- memberships (tier_id there is a plain text snapshot, not an FK), so no
-- purchase history depends on these specific rows existing, and no real
-- per-gym edits exist yet at the point this runs.
--
-- NOT safe to re-run once real per-gym data exists: unlike every other
-- migration in this project, the unconditional "delete from
-- catalog_items" below would wipe out real owner edits on a second run.
-- This is a one-time corrective migration, run once immediately after
-- 0029/0030, not a template for a future schema change.

alter table public.catalog_items add column if not exists gym text;

delete from public.catalog_items;

alter table public.catalog_items alter column gym set not null;

alter table public.catalog_items drop constraint if exists catalog_items_item_id_key;
alter table public.catalog_items drop constraint if exists catalog_items_gym_item_id_key;
alter table public.catalog_items add constraint catalog_items_gym_item_id_key unique (gym, item_id);

drop index if exists catalog_items_type_idx;
create index if not exists catalog_items_gym_type_idx on public.catalog_items (gym, type, enabled);
