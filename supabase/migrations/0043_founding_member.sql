-- Hove's Founding Member offer: waitlist converts who buy the Combo
-- Silver founding pack get 20% off every future PAYG (credit_pack)
-- purchase, forever, revoked permanently the moment their membership
-- cancels — confirmed with the user 2026-08-20. Not a redeemable
-- discount code (shareable, typed at checkout) — a permanent flag on a
-- specific member's own record, staff-set (not automatically granted by
-- buying Combo Silver, since that tier stays a normal purchasable
-- product after the founding window closes too).
alter table public.members
  add column if not exists founding_member boolean not null default false;

comment on column public.members.founding_member is
  'Staff-granted, not automatic. Grants 20% off every future PAYG (credit_pack) purchase. Revoked automatically when the member''s membership is cancelled — no re-entry once lost.';
