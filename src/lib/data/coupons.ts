import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";

export type DiscountType = "percentage" | "fixed";
export type UsageLimitType = "once_per_member" | "total_cap" | "unlimited";

export interface Coupon {
  id: number;
  gym: GymName;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  usageLimitType: UsageLimitType;
  usageLimitValue: number | null;
  enabled: boolean;
  itemIds: number[]; // catalog_items.id — which items this coupon applies to
  redeemedCount: number;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Full list for one gym, including disabled coupons — Setup's own management page. */
export async function listCoupons(gym: GymName): Promise<Coupon[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("coupons")
    .select("id, gym, code, discount_type, discount_value, usage_limit_type, usage_limit_value, enabled, coupon_items(catalog_item_id)")
    .eq("gym", gym)
    .order("created_at", { ascending: false })
    .returns<
      {
        id: number;
        gym: string;
        code: string;
        discount_type: DiscountType;
        discount_value: number;
        usage_limit_type: UsageLimitType;
        usage_limit_value: number | null;
        enabled: boolean;
        coupon_items: { catalog_item_id: number }[];
      }[]
    >();
  if (error) throw error;

  const coupons = data ?? [];
  const counts = await getRedemptionCounts(coupons.map((c) => c.id));

  return coupons.map((row) => ({
    id: row.id,
    gym: row.gym as GymName,
    code: row.code,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    usageLimitType: row.usage_limit_type,
    usageLimitValue: row.usage_limit_value,
    enabled: row.enabled,
    itemIds: row.coupon_items.map((ci) => ci.catalog_item_id),
    redeemedCount: counts.get(row.id) ?? 0,
  }));
}

async function getRedemptionCounts(couponIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (couponIds.length === 0) return counts;
  const admin = createAdminClient();
  const { data, error } = await admin.from("coupon_redemptions").select("coupon_id").in("coupon_id", couponIds);
  if (error) throw error;
  for (const row of data ?? []) {
    counts.set(row.coupon_id, (counts.get(row.coupon_id) ?? 0) + 1);
  }
  return counts;
}

export type CreateCouponResult = { status: "ok"; coupon: Coupon } | { status: "duplicate_code" } | { status: "error"; message: string };

export async function createCoupon(input: {
  gym: GymName;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  usageLimitType: UsageLimitType;
  usageLimitValue?: number | null;
  itemIds: number[];
}): Promise<CreateCouponResult> {
  const admin = createAdminClient();
  const code = normalizeCode(input.code);

  const { data: existing } = await admin.from("coupons").select("id").eq("gym", input.gym).eq("code", code).maybeSingle();
  if (existing) return { status: "duplicate_code" };

  const { data: coupon, error } = await admin
    .from("coupons")
    .insert({
      gym: input.gym,
      code,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      usage_limit_type: input.usageLimitType,
      usage_limit_value: input.usageLimitType === "total_cap" ? (input.usageLimitValue ?? null) : null,
    })
    .select("id")
    .single();
  if (error) return { status: "error", message: error.message };

  if (input.itemIds.length > 0) {
    const { error: itemsError } = await admin
      .from("coupon_items")
      .insert(input.itemIds.map((catalogItemId) => ({ coupon_id: coupon.id, catalog_item_id: catalogItemId })));
    if (itemsError) return { status: "error", message: itemsError.message };
  }

  return {
    status: "ok",
    coupon: {
      id: coupon.id,
      gym: input.gym,
      code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      usageLimitType: input.usageLimitType,
      usageLimitValue: input.usageLimitType === "total_cap" ? (input.usageLimitValue ?? null) : null,
      enabled: true,
      itemIds: input.itemIds,
      redeemedCount: 0,
    },
  };
}

export type SetCouponEnabledResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

/** gym is checked alongside id so an owner can never disable another gym's coupon by guessing its numeric id. */
export async function setCouponEnabled(gym: GymName, id: number, enabled: boolean): Promise<SetCouponEnabledResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("coupons")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("gym", gym)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}
