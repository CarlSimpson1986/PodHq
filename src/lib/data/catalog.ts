import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";

export type CatalogItemType = "credit_pack" | "membership";

// Not a closed TS union yet, deliberately — same reasoning as
// pod_resources.credit_type (src/lib/data/pods.ts): only 'pod' and
// 'recovery' exist today (Hove, confirmed live 2026-08-17), but this is
// plain text end to end (no DB CHECK either), so a future gym adding a
// third resource type needs no schema/type-union change here.
export interface CatalogItem {
  id: number;
  gym: GymName;
  itemId: string;
  type: CatalogItemType;
  name: string;
  label: string;
  credits: number;
  creditType: string;
  priceGBP: number;
  enabled: boolean;
  oneTimePerMember: boolean;
}

function mapRow(row: {
  id: number;
  gym: string;
  item_id: string;
  type: CatalogItemType;
  name: string;
  label: string;
  credits: number;
  credit_type: string;
  price_gbp: number;
  enabled: boolean;
  one_time_per_member: boolean;
}): CatalogItem {
  return {
    id: row.id,
    gym: row.gym as GymName,
    itemId: row.item_id,
    type: row.type,
    name: row.name,
    label: row.label,
    credits: row.credits,
    creditType: row.credit_type,
    priceGBP: row.price_gbp,
    enabled: row.enabled,
    oneTimePerMember: row.one_time_per_member,
  };
}

/** Full list for one gym, including disabled rows — Setup's own management page. */
export async function listCatalogItems(gym: GymName): Promise<CatalogItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("catalog_items").select("*").eq("gym", gym).order("type").order("name");
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Enabled-only, one gym, one type — what staff/members are actually offered to buy (the sell panel, self-service buy pages). */
export async function getEnabledCatalogItems(gym: GymName, type: CatalogItemType): Promise<CatalogItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalog_items")
    .select("*")
    .eq("gym", gym)
    .eq("type", type)
    .eq("enabled", true)
    .order("price_gbp");
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** A single item by gym + stable slug, regardless of enabled state — used to validate/price an in-flight sale, not to decide what's offered. */
export async function getCatalogItemBySlug(gym: GymName, itemId: string): Promise<CatalogItem | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("catalog_items").select("*").eq("gym", gym).eq("item_id", itemId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type CreateCatalogItemResult = { status: "ok"; item: CatalogItem } | { status: "error"; message: string };

export async function createCatalogItem(input: {
  gym: GymName;
  type: CatalogItemType;
  name: string;
  label: string;
  credits: number;
  creditType?: string;
  priceGBP: number;
  oneTimePerMember?: boolean;
}): Promise<CreateCatalogItemResult> {
  const admin = createAdminClient();
  const baseSlug = slugify(input.name);
  let itemId = baseSlug;

  // Slugs are the stable id members'/staff's history keys off (unique per
  // gym, not globally) — auto-dedupe with a numeric suffix rather than
  // rejecting outright, since staff naming two packs "PT Pack" (e.g.
  // different durations already captured in label) is a normal thing to
  // want to do.
  for (let suffix = 2; ; suffix++) {
    const { data: existing } = await admin.from("catalog_items").select("id").eq("gym", input.gym).eq("item_id", itemId).maybeSingle();
    if (!existing) break;
    itemId = `${baseSlug}-${suffix}`;
  }

  const { data, error } = await admin
    .from("catalog_items")
    .insert({
      gym: input.gym,
      item_id: itemId,
      type: input.type,
      name: input.name,
      label: input.label,
      credits: input.credits,
      credit_type: input.creditType ?? "pod",
      price_gbp: input.priceGBP,
      one_time_per_member: input.oneTimePerMember ?? false,
    })
    .select("*")
    .single();

  if (error) return { status: "error", message: error.message };
  return { status: "ok", item: mapRow(data) };
}

export type UpdateCatalogItemResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

/** gym is checked alongside id so an owner can never edit another gym's row by guessing its numeric id. */
export async function updateCatalogItem(
  gym: GymName,
  id: number,
  input: { name: string; label: string; credits: number; priceGBP: number; oneTimePerMember: boolean }
): Promise<UpdateCatalogItemResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalog_items")
    .update({
      name: input.name,
      label: input.label,
      credits: input.credits,
      price_gbp: input.priceGBP,
      one_time_per_member: input.oneTimePerMember,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("gym", gym)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}

export async function setCatalogItemEnabled(gym: GymName, id: number, enabled: boolean): Promise<UpdateCatalogItemResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalog_items")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("gym", gym)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}
