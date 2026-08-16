-- Supports a "one-time per member" catalog item (e.g. an Intro Pack) —
-- requested 2026-08-16. Self-service purchase must be blocked after a
-- member's first purchase of such an item; staff selling/comping via
-- podHq is deliberately exempt (staff discretion).
--
-- one_time_per_member is a per-item toggle in Setup, not a hardcoded name
-- match — any credit pack or membership can be marked limited.
--
-- catalog_item_id on credits records which catalog item a purchase/grant
-- came from, so "has this member ever received this item" can actually be
-- answered — nothing tracked this before. Nullable: only credit-pack-type
-- purchases/grants set it; manual "Grant credit" (no catalog item
-- involved) and booking_used/booking_refund rows leave it null.
--
-- Safe to re-run: idempotent (add column if not exists), matching every
-- migration since 0001.
alter table public.catalog_items add column if not exists one_time_per_member boolean not null default false;
alter table public.credits add column if not exists catalog_item_id text;

create index if not exists credits_catalog_item_idx on public.credits (member_id, catalog_item_id) where catalog_item_id is not null;
