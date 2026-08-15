-- Re-seeds catalog_items now that it's gym-scoped — every gym starts from
-- the same 14 items/prices 0030 originally seeded (the real, current
-- figures every gym has actually been charging), so nothing changes for
-- any gym until its own owner edits their copy in Setup.

insert into public.catalog_items (gym, item_id, type, name, label, credits, price_gbp)
select g.gym, t.item_id, t.type, t.name, t.label, t.credits, t.price_gbp
from (values
  ('Aylesbury Berryfields'),
  ('Basingstoke'),
  ('Berkhamsted'),
  ('Crewe'),
  ('Fairford Leys'),
  ('Hackney'),
  ('Kingston upon Thames'),
  ('Milton Keynes'),
  ('Oxford East')
) as g(gym)
cross join (values
  ('intro-pack', 'credit_pack', 'Intro Pack', '5 credits', 5, 54::numeric),
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
) as t(item_id, type, name, label, credits, price_gbp)
on conflict (gym, item_id) do nothing;
