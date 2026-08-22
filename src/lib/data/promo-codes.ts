import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";

export type DiscountType = "percentage" | "fixed";
export type UsageLimitType = "once_per_member" | "total_cap" | "unlimited";

export interface PromoCode {
  id: number;
  gym: GymName;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  usageLimitType: UsageLimitType;
  usageLimitValue: number | null;
  enabled: boolean;
  itemIds: number[]; // catalog_items.id — which items this code applies to
  redeemedCount: number;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Full list for one gym, including disabled codes — Setup's own management page. */
export async function listPromoCodes(gym: GymName): Promise<PromoCode[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promo_codes")
    .select("id, gym, code, discount_type, discount_value, usage_limit_type, usage_limit_value, enabled, promo_code_items(catalog_item_id)")
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
        promo_code_items: { catalog_item_id: number }[];
      }[]
    >();
  if (error) throw error;

  const promoCodes = data ?? [];
  const counts = await getRedemptionCounts(promoCodes.map((c) => c.id));

  return promoCodes.map((row) => ({
    id: row.id,
    gym: row.gym as GymName,
    code: row.code,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    usageLimitType: row.usage_limit_type,
    usageLimitValue: row.usage_limit_value,
    enabled: row.enabled,
    itemIds: row.promo_code_items.map((ci) => ci.catalog_item_id),
    redeemedCount: counts.get(row.id) ?? 0,
  }));
}

async function getRedemptionCounts(promoCodeIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (promoCodeIds.length === 0) return counts;
  const admin = createAdminClient();
  const { data, error } = await admin.from("promo_code_redemptions").select("promo_code_id").in("promo_code_id", promoCodeIds);
  if (error) throw error;
  for (const row of data ?? []) {
    counts.set(row.promo_code_id, (counts.get(row.promo_code_id) ?? 0) + 1);
  }
  return counts;
}

export type CreatePromoCodeResult = { status: "ok"; promoCode: PromoCode } | { status: "duplicate_code" } | { status: "error"; message: string };

export async function createPromoCode(input: {
  gym: GymName;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  usageLimitType: UsageLimitType;
  usageLimitValue?: number | null;
  itemIds: number[];
}): Promise<CreatePromoCodeResult> {
  const admin = createAdminClient();
  const code = normalizeCode(input.code);

  const { data: existing } = await admin.from("promo_codes").select("id").eq("gym", input.gym).eq("code", code).maybeSingle();
  if (existing) return { status: "duplicate_code" };

  const { data: promoCode, error } = await admin
    .from("promo_codes")
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
      .from("promo_code_items")
      .insert(input.itemIds.map((catalogItemId) => ({ promo_code_id: promoCode.id, catalog_item_id: catalogItemId })));
    if (itemsError) return { status: "error", message: itemsError.message };
  }

  return {
    status: "ok",
    promoCode: {
      id: promoCode.id,
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

export type SetPromoCodeEnabledResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

/** gym is checked alongside id so an owner can never disable another gym's promo code by guessing its numeric id. */
export async function setPromoCodeEnabled(gym: GymName, id: number, enabled: boolean): Promise<SetPromoCodeEnabledResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promo_codes")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("gym", gym)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}
