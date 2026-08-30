import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";

export interface CardioEquipment {
  id: number;
  gym: GymName;
  name: string;
  enabled: boolean;
  createdAt: string;
}

function mapRow(row: { id: number; gym: string; name: string; enabled: boolean; created_at: string }): CardioEquipment {
  return {
    id: row.id,
    gym: row.gym as GymName,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

/** Full list for one gym, including disabled rows — Setup's own management page. */
export async function listCardioEquipment(gym: GymName): Promise<CardioEquipment[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("gym_cardio_equipment").select("*").eq("gym", gym).order("name");
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Enabled-only — what podhq-client's member-facing picker offers. */
export async function getEnabledCardioEquipment(gym: GymName): Promise<CardioEquipment[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("gym_cardio_equipment").select("*").eq("gym", gym).eq("enabled", true).order("name");
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export type CreateCardioEquipmentResult = { status: "ok"; item: CardioEquipment } | { status: "error"; message: string };

export async function createCardioEquipment(gym: GymName, name: string): Promise<CreateCardioEquipmentResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("gym_cardio_equipment").insert({ gym, name }).select("*").single();
  if (error) return { status: "error", message: error.message };
  return { status: "ok", item: mapRow(data) };
}

export type UpdateCardioEquipmentResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

/** gym is checked alongside id so an owner can never edit another gym's row by guessing its numeric id — same posture as updateCatalogItem. */
export async function updateCardioEquipment(gym: GymName, id: number, name: string): Promise<UpdateCardioEquipmentResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_cardio_equipment")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("gym", gym)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}

export async function setCardioEquipmentEnabled(gym: GymName, id: number, enabled: boolean): Promise<UpdateCardioEquipmentResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_cardio_equipment")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("gym", gym)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}
