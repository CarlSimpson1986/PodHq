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

export interface AccessEvent {
  id: number;
  memberId: number;
  memberName: string;
  attemptedAt: string;
  success: boolean;
  kisiResponse: string | null;
}

export interface MemberProfile {
  id: number;
  name: string;
  gym: GymName;
  mobileNumber: string | null;
  gender: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressPostcode: string | null;
  waiverSignedName: string | null;
  waiverSignedAt: string | null;
  createdAt: string;
  creditBalance: number;
}

export interface MemberBooking {
  id: number;
  slotStart: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
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

/**
 * Door-unlock attempts (success and blocked) for the "Access" log —
 * distinct from bookings: this is what actually happened at the door,
 * timestamped by attempted_at, not the booked slot_start. Filtered via
 * members.gym since pod_access_events itself has no gym column.
 */
export async function getAccessEventsForGym(gym: GymName, date: Date): Promise<AccessEvent[]> {
  const admin = createAdminClient();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const { data, error } = await admin
    .from("pod_access_events")
    .select("id, member_id, attempted_at, success, kisi_response, members!inner(name, gym)")
    .eq("members.gym", gym)
    .gte("attempted_at", startOfDay.toISOString())
    .lt("attempted_at", endOfDay.toISOString())
    .order("attempted_at", { ascending: false })
    .returns<
      {
        id: number;
        member_id: number;
        attempted_at: string;
        success: boolean;
        kisi_response: string | null;
        members: { name: string } | null;
      }[]
    >();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.members?.name ?? "Unknown member",
    attemptedAt: row.attempted_at,
    success: row.success,
    kisiResponse: row.kisi_response,
  }));
}

/**
 * A single member's profile for staff use (admin/owner), reached by
 * clicking their name in the Access log — separate identity space from
 * Revenue's sold_to customers (Stage 6's /members/customer page): this is
 * podhq-client's own `members` table (auth_user_id, pod bookings/credits),
 * not GymFlow's Revenue data.
 */
export async function getMemberProfile(memberId: number): Promise<MemberProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("members")
    .select(
      "id, name, gym, mobile_number, gender, address_line1, address_line2, address_city, address_postcode, waiver_signed_name, waiver_signed_at, created_at"
    )
    .eq("id", memberId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: balance, error: balanceError } = await admin.rpc("get_credit_balance", { p_member_id: memberId });
  if (balanceError) throw balanceError;

  return {
    id: data.id,
    name: data.name,
    gym: data.gym as GymName,
    mobileNumber: data.mobile_number,
    gender: data.gender,
    addressLine1: data.address_line1,
    addressLine2: data.address_line2,
    addressCity: data.address_city,
    addressPostcode: data.address_postcode,
    waiverSignedName: data.waiver_signed_name,
    waiverSignedAt: data.waiver_signed_at,
    createdAt: data.created_at,
    creditBalance: (balance as number) ?? 0,
  };
}

export async function getBookingsForMember(memberId: number): Promise<MemberBooking[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select("id, slot_start, status")
    .eq("member_id", memberId)
    .order("slot_start", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    slotStart: row.slot_start,
    status: row.status as MemberBooking["status"],
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

/** For the Calendar grid — one query covering the whole visible range (week/day), bucketed into per-slot counts client-side rather than one query per cell. */
export async function getBookingsForGymAndRange(gym: GymName, start: Date, endExclusive: Date): Promise<PodBooking[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select("id, member_id, slot_start, status, members(name)")
    .eq("gym", gym)
    .eq("status", "booked")
    .gte("slot_start", start.toISOString())
    .lt("slot_start", endExclusive.toISOString())
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

export interface SlotBookingEntry {
  bookingId: number;
  memberId: number;
  memberName: string;
  status: PodBooking["status"];
}

export interface SlotWaitlistEntry {
  memberId: number;
  memberName: string;
}

export interface SlotDetail {
  bookings: SlotBookingEntry[];
  waitlist: SlotWaitlistEntry[];
}

/** Powers the Calendar's click-a-slot panel: who's booked (any status, so a cancelled row is still visible for context) and who's waiting, for one exact slot. */
export async function getSlotDetail(gym: GymName, slotStartIso: string): Promise<SlotDetail> {
  const admin = createAdminClient();

  const [bookingsResult, waitlistResult] = await Promise.all([
    admin
      .from("bookings")
      .select("id, member_id, status, members(name)")
      .eq("gym", gym)
      .eq("slot_start", slotStartIso)
      .returns<{ id: number; member_id: number; status: PodBooking["status"]; members: { name: string } | null }[]>(),
    admin
      .from("waitlist_entries")
      .select("member_id, members(name)")
      .eq("gym", gym)
      .eq("slot_start", slotStartIso)
      .eq("status", "waiting")
      .returns<{ member_id: number; members: { name: string } | null }[]>(),
  ]);

  if (bookingsResult.error) throw bookingsResult.error;
  if (waitlistResult.error) throw waitlistResult.error;

  return {
    bookings: (bookingsResult.data ?? []).map((row) => ({
      bookingId: row.id,
      memberId: row.member_id,
      memberName: row.members?.name ?? "Unknown member",
      status: row.status,
    })),
    waitlist: (waitlistResult.data ?? []).map((row) => ({
      memberId: row.member_id,
      memberName: row.members?.name ?? "Unknown member",
    })),
  };
}

export type CancelBookingResult =
  | { status: "ok"; refunded: boolean }
  | { status: "not_found" }
  | { status: "already_cancelled" }
  | { status: "error"; message: string };

/**
 * Staff-initiated cancellation from the Calendar's slot panel — reuses the
 * same cancel_booking() RPC and 2-hour refund/forfeit policy as the
 * member-facing Cancel button in podhq-client, rather than inventing a
 * separate staff policy. The booking's own member_id is looked up
 * server-side (never trusts a client-supplied id), which also doubles as
 * cancel_booking()'s ownership check.
 */
export async function cancelBookingAsStaff(gym: GymName, bookingId: number): Promise<CancelBookingResult> {
  const admin = createAdminClient();
  const { data: booking, error: lookupError } = await admin
    .from("bookings")
    .select("member_id, gym")
    .eq("id", bookingId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!booking || booking.gym !== gym) return { status: "not_found" };

  const { data, error } = await admin.rpc("cancel_booking", {
    p_member_id: booking.member_id,
    p_booking_id: bookingId,
  });

  if (error) {
    if (error.message.includes("booking_not_found")) return { status: "not_found" };
    if (error.message.includes("already_cancelled")) return { status: "already_cancelled" };
    return { status: "error", message: error.message };
  }

  return { status: "ok", refunded: data as boolean };
}
