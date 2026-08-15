-- Seeds catalog_items with the exact values the CREDIT_PACKAGES /
-- MEMBERSHIP_TIERS arrays held immediately before this migration (see
-- podhq-client's src/lib/credit-packages.ts / membership-tiers.ts, and
-- podHq's own copies) — same item_id slugs, so existing memberships/
-- purchases keep resolving against this table exactly as they did against
-- the old arrays.
--
-- on conflict do nothing: safe to re-run, and safe even if a future
-- session's manual catalog edit already changed one of these rows —
-- this seed should never clobber a real edit.

insert into public.catalog_items (item_id, type, name, label, credits, price_gbp) values
  ('intro-pack', 'credit_pack', 'Intro Pack', '5 credits', 5, 54),
  ('smart-saver', 'credit_pack', 'Smart Saver', '1 credit', 1, 10.8),
  ('train-solo-payg', 'credit_pack', 'Train Solo PAYG', '1 credit', 1, 13.5),
  ('pt-pack-payg', 'credit_pack', 'PT Pack PAYG', '1 credit', 1, 17.5),
  ('train-with-a-friend-payg', 'credit_pack', 'Train With A Friend PAYG', '1 credit', 1, 15),
  ('train-with-your-team-payg', 'credit_pack', 'Train With Your Team PAYG', '1 credit', 1, 20),
  ('pt-pack-10', 'credit_pack', 'PT Pack — 10 Sessions', '10 credits', 10, 150),
  ('pt-pack-20', 'credit_pack', 'PT Pack — 20 Visits', '20 credits', 20, 250),
  ('pt-pack-30', 'credit_pack', 'PT Pack — 30 Visits', '30 credits', 30, 300),
  ('smart-save', 'membership', 'Smart Save', '1 credit / month', 1, 10.8),
  ('5-sessions', 'membership', '5 Sessions Per Month', '5 credits / month', 5, 60),
  ('10-sessions', 'membership', '10 Sessions Per Month', '10 credits / month', 10, 100),
  ('20-sessions', 'membership', '20 Session Pack', '20 credits / month', 20, 180),
  ('30-sessions', 'membership', '30 Sessions Per Month', '30 credits / month', 30, 240)
on conflict (item_id) do nothing;
