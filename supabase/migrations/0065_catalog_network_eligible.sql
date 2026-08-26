-- Restricts the cross-gym network top-up credit (0064_pod_network_credit.sql,
-- same day) to genuine plain gym-session packs — Carl's call: a PT pack
-- shouldn't become network-wide/discounted just because the member has a
-- membership, since a PT session is tied to a specific trainer at a
-- specific gym, unlike a regular solo pod credit.
--
-- Recovery Room packs are already excluded automatically (separate
-- credit_type = 'recovery'), but PT packs share the exact same
-- credit_type = 'pod' as a plain solo credit — nothing in the schema
-- distinguished "needs a trainer" from "walk-in solo" before this, so
-- credit_type alone can't gate it. New explicit flag instead.
--
-- Defaults true (a plain gym-session pack, the common case) so any new
-- pack added later is network-eligible unless someone flips it off —
-- matches every existing pack except the PT ones backfilled below.
-- Not yet exposed as a Setup UI toggle — set via this migration's own
-- backfill for today's real catalog, or by hand in SQL for anything
-- added later, until a checkbox is worth building.
--
-- Safe to re-run: idempotent, matching every migration since 0001.

alter table public.catalog_items
  add column if not exists network_eligible boolean not null default true;

update public.catalog_items
set network_eligible = false
where type = 'credit_pack'
  and (
    credit_type = 'recovery'
    or name ilike 'PT Pack%'
    or name ilike '%— PT'
  );
