import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";

export interface PodMember {
  id: number;
  name: string;
}

export interface PodBooking {
  id: number;
  memberId: number;
  memberName: string;
  slotStart: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
}

export interface PodSettings {
  gym: GymName;
  podCapacity: number;
  openHour: number;
  closeHour: number;
}

/** Null when this gym has no gym_kisi_mapping row — no pod configured yet. */
export async function getPodSettings(gym: GymName): Promise<PodSettings | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_kisi_mapping")
    .select("gym, pod_capacity, open_hour, close_hour")
    .eq("gym", gym)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { gym: data.gym as GymName, podCapacity: data.pod_capacity, openHour: data.open_hour, closeHour: data.close_hour };
}

export async function updatePodSettings(
  gym: GymName,
  settings: { podCapacity: number; openHour: number; closeHour: number }
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_kisi_mapping")
    .update({ pod_capacity: settings.podCapacity, open_hour: settings.openHour, close_hour: settings.closeHour })
    .eq("gym", gym)
    .select("gym")
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/** For the manual-booking member picker — small table at pilot scale, no pagination needed. */
export async function getMembersForGym(gym: GymName): Promise<PodMember[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("members").select("id, name").eq("gym", gym).order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getBookingsForGymAndDate(gym: GymName, date: Date): Promise<PodBooking[]> {
  const admin = createAdminClient();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const { data, error } = await admin
    .from("bookings")
    .select("id, member_id, slot_start, status, members(name)")
    .eq("gym", gym)
    .gte("slot_start", startOfDay.toISOString())
    .lt("slot_start", endOfDay.toISOString())
    .order("slot_start")
    .returns<{ id: number; member_id: number; slot_start: string; status: PodBooking["status"]; members: { name: string } | null }[]>();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.members?.name ?? "Unknown member",
    slotStart: row.slot_start,
    status: row.status,
  }));
}

export type CreateManualBookingResult =
  | { status: "ok"; bookingId: number }
  | { status: "insufficient_credits" }
  | { status: "slot_full" }
  | { status: "error"; message: string };

export async function createManualBooking(
  gym: GymName,
  memberId: number,
  slotStartIso: string
): Promise<CreateManualBookingResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_booking", {
    p_member_id: memberId,
    p_gym: gym,
    p_slot_start: slotStartIso,
  });

  if (error) {
    if (error.message.includes("insufficient_credits")) return { status: "insufficient_credits" };
    if (error.message.includes("slot_full")) return { status: "slot_full" };
    return { status: "error", message: error.message };
  }

  return { status: "ok", bookingId: data as number };
}
