-- Member-redeemed discount codes, confirmed with the user 2026-08-20:
-- staff create a coupon (code, discount type/value, usage limit type/
-- value, which specific catalog items it applies to — all configurable
-- per coupon, not fixed rules), and members redeem it themselves at
-- self-service checkout. Deliberately separate from the Founding Member
-- offer (0043) — that's a permanent per-member flag, this is a
-- shareable, reusable code with its own usage limits.

create table if not exists public.coupons (
  id bigint generated always as identity primary key,
  gym text not null,
  -- Stored uppercase, matched uppercase — avoids needing citext for
  -- case-insensitive lookup, same reasoning as catalog_items' plain-text
  -- credit_type (no extension dependency for something this simple).
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric not null check (discount_value > 0),
  usage_limit_type text not null check (usage_limit_type in ('once_per_member', 'total_cap', 'unlimited')),
  -- Only meaningful (and required) for 'total_cap' — enforced at the
  -- application layer, not a CHECK, same pattern this project already
  -- uses for conditional-required fields (e.g. credits_secondary).
  usage_limit_value integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym, code)
);

create index if not exists coupons_gym_idx on public.coupons (gym);

alter table public.coupons enable row level security;
-- Same pattern as catalog_items/gym_kisi_mapping/auth_events — no
-- policies, service-role client only.

-- Which catalog items a coupon applies to — staff-selected, not "all
-- memberships" or "all credit packs", per the user's explicit choice.
create table if not exists public.coupon_items (
  id bigint generated always as identity primary key,
  coupon_id bigint not null references public.coupons(id) on delete cascade,
  catalog_item_id bigint not null references public.catalog_items(id) on delete cascade,
  unique (coupon_id, catalog_item_id)
);

alter table public.coupon_items enable row level security;

-- One row per successful redemption — drives both usage-limit enforcement
-- (redeem_coupon() below) and a real audit trail of who used what.
create table if not exists public.coupon_redemptions (
  id bigint generated always as identity primary key,
  coupon_id bigint not null references public.coupons(id),
  member_id bigint not null references public.members(id),
  catalog_item_id bigint not null references public.catalog_items(id),
  created_at timestamptz not null default now()
);

create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);
create index if not exists coupon_redemptions_member_idx on public.coupon_redemptions (member_id);

alter table public.coupon_redemptions enable row level security;

-- Atomic check-and-claim, same reasoning as claim_membership_slot (0033)
-- and create_booking's advisory lock (0039) — without this, two members
-- redeeming a total_cap coupon's last slot at the same moment could both
-- pass a plain "count < cap" check before either insert lands. Called at
-- Checkout Session *creation* time (before payment), not after — the
-- accepted tradeoff (documented, matches every other discount-code
-- system's real-world behaviour) is that an abandoned checkout still
-- consumes a claimed slot on a capped coupon, since there's no signal
-- back to the server when a member simply closes the tab.
create or replace function public.redeem_coupon(
  p_coupon_id bigint,
  p_member_id bigint,
  p_catalog_item_id bigint
) returns boolean
language plpgsql
as $$
declare
  v_limit_type text;
  v_limit_value integer;
  v_used_count integer;
  v_already_used boolean;
begin
  perform pg_advisory_xact_lock(hashtext('coupon:' || p_coupon_id::text));

  select usage_limit_type, usage_limit_value into v_limit_type, v_limit_value
  from public.coupons
  where id = p_coupon_id and enabled = true;

  if v_limit_type is null then
    return false;
  end if;

  if v_limit_type = 'once_per_member' then
    select exists(
      select 1 from public.coupon_redemptions
      where coupon_id = p_coupon_id and member_id = p_member_id
    ) into v_already_used;
    if v_already_used then
      return false;
    end if;
  elsif v_limit_type = 'total_cap' then
    select count(*) into v_used_count from public.coupon_redemptions where coupon_id = p_coupon_id;
    if v_used_count >= v_limit_value then
      return false;
    end if;
  end if;

  insert into public.coupon_redemptions (coupon_id, member_id, catalog_item_id)
  values (p_coupon_id, p_member_id, p_catalog_item_id);

  return true;
end;
$$;
