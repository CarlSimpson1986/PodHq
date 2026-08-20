-- Combo memberships (e.g. Hove's Gym+Recovery Room package) are one real
-- membership product that grants credits of two different types per
-- period, not two separate membership products — confirmed with the user
-- 2026-08-20, replacing the earlier "split into two linked catalog items"
-- workaround, which turned out to be fundamentally broken: memberships
-- has a hard `unique (member_id)` constraint (0014), so a member could
-- never actually hold both halves of a combo at once.
--
-- credit_type isn't stored on the memberships table at all — it only
-- ever travels through the Stripe subscription's metadata and is re-read
-- on every credit grant (first period + each renewal). So this only
-- needs a catalog_items change, not a memberships migration: a nullable
-- secondary credit type + amount lets one catalog item (and the one
-- Stripe subscription it creates) represent both allocations.
alter table public.catalog_items
  add column if not exists credits_secondary integer,
  add column if not exists credit_type_secondary text;

comment on column public.catalog_items.credits_secondary is
  'For combo memberships only: a second credit grant amount per period, alongside the primary credits/credit_type. Null for every ordinary (single-type) item.';
comment on column public.catalog_items.credit_type_secondary is
  'For combo memberships only: the credit_type the secondary grant uses. Null for every ordinary item.';
