import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuthEvent } from "@/lib/audit";
import type { GymName } from "./types";

export interface StaffActor {
  userId: string;
  email: string;
}

export interface PodMember {
  id: number;
  name: string;
}

export interface PodBooking {
  id: number;
  memberId: number;
  memberName: string;
  resourceId: number;
  slotStart: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
}

// One row per bookable resource (a gym can have more than one — see
// pod_resources, 0038_pod_resources.sql). accessProvider/creditType are
// plain strings here, not a closed TS union yet — Milestone 1
// (Berkhamsted) never produces anything but 'kisi'/'pod', and widening
// this to a real union is Milestone 2's job once Brighton's 'pdk'/
// 'recovery' values actually exist.
export interface PodResource {
  id: number;
  gym: GymName;
  resourceKey: string;
  label: string;
  creditType: string;
  slotDurationMinutes: number;
  accessProvider: string;
  podCapacity: number;
  openHour: number;
  closeHour: number;
}

export interface AccessEvent {
  id: number;
  memberId: number;
  memberName: string;
  resourceId: number | null;
  resourceLabel: string | null;
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
  foundingMember: boolean;
}

export interface MemberBooking {
  id: number;
  slotStart: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
}

/** Every bookable resource at a gym — empty array if none configured yet. Ordered by resource_key for a stable tab order. */
export async function getPodResourcesForGym(gym: GymName): Promise<PodResource[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pod_resources")
    .select("id, gym, resource_key, label, credit_type, slot_duration_minutes, access_provider, pod_capacity, open_hour, close_hour")
    .eq("gym", gym)
    .order("resource_key");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    gym: row.gym as GymName,
    resourceKey: row.resource_key,
    label: row.label,
    creditType: row.credit_type,
    slotDurationMinutes: row.slot_duration_minutes,
    accessProvider: row.access_provider,
    podCapacity: row.pod_capacity,
    openHour: row.open_hour,
    closeHour: row.close_hour,
  }));
}

export async function getPodResourceById(resourceId: number): Promise<PodResource | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pod_resources")
    .select("id, gym, resource_key, label, credit_type, slot_duration_minutes, access_provider, pod_capacity, open_hour, close_hour")
    .eq("id", resourceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    gym: data.gym as GymName,
    resourceKey: data.resource_key,
    label: data.label,
    creditType: data.credit_type,
    slotDurationMinutes: data.slot_duration_minutes,
    accessProvider: data.access_provider,
    podCapacity: data.pod_capacity,
    openHour: data.open_hour,
    closeHour: data.close_hour,
  };
}

export async function updatePodResourceSettings(
  resourceId: number,
  gym: GymName,
  settings: { podCapacity: number; openHour: number; closeHour: number }
): Promise<boolean> {
  const admin = createAdminClient();
  // gym re-checked here, not just trusted from the caller's own scope
  // resolution — same defensive shape as every other resource-scoped
  // write in this file (createManualBooking, cancelBookingAsStaff).
  const { data, error } = await admin
    .from("pod_resources")
    .update({ pod_capacity: settings.podCapacity, open_hour: settings.openHour, close_hour: settings.closeHour })
    .eq("id", resourceId)
    .eq("gym", gym)
    .select("id")
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
    .select("id, member_id, resource_id, slot_start, status, members(name)")
    .eq("gym", gym)
    .gte("slot_start", startOfDay.toISOString())
    .lt("slot_start", endOfDay.toISOString())
    .order("slot_start")
    .returns<
      { id: number; member_id: number; resource_id: number; slot_start: string; status: PodBooking["status"]; members: { name: string } | null }[]
    >();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.members?.name ?? "Unknown member",
    resourceId: row.resource_id,
    slotStart: row.slot_start,
    status: row.status,
  }));
}

/**
 * Door-unlock attempts (success and blocked) for the "Access" log —
 * distinct from bookings: this is what actually happened at the door,
 * timestamped by attempted_at, not the booked slot_start. Filtered via
 * members.gym since pod_access_events itself has no gym column. Resource
 * is joined transitively via booking_id -> bookings.resource_id (kept
 * off pod_access_events itself deliberately — low event volume, a join
 * is cheap and avoids a second column to keep in sync).
 */
export async function getAccessEventsForGym(gym: GymName, date: Date): Promise<AccessEvent[]> {
  const admin = createAdminClient();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const { data, error } = await admin
    .from("pod_access_events")
    .select("id, member_id, attempted_at, success, kisi_response, members!inner(name, gym), bookings(resource_id, pod_resources(label))")
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
        bookings: { resource_id: number; pod_resources: { label: string } | null } | null;
      }[]
    >();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.members?.name ?? "Unknown member",
    resourceId: row.bookings?.resource_id ?? null,
    resourceLabel: row.bookings?.pod_resources?.label ?? null,
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
      "id, name, gym, mobile_number, gender, address_line1, address_line2, address_city, address_postcode, waiver_signed_name, waiver_signed_at, created_at, founding_member"
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
    foundingMember: data.founding_member,
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
  | { status: "not_found" }
  | { status: "error"; message: string };

export async function createManualBooking(
  gym: GymName,
  resourceId: number,
  memberId: number,
  slotStartIso: string
): Promise<CreateManualBookingResult> {
  const admin = createAdminClient();

  // Same ownership check as grantCreditToMember/cancelBookingAsStaff — the
  // member's real gym is looked up server-side rather than trusting the
  // caller's memberId to already belong to the gym they're booking for.
  // resourceId's own gym is checked too — a resourceId from a different
  // gym than the caller's selected gym must be rejected here, since
  // create_booking() itself derives gym from the resource and has no way
  // to know the caller's intended gym was different.
  const [memberResult, resourceResult] = await Promise.all([
    admin.from("members").select("id, gym").eq("id", memberId).maybeSingle(),
    admin.from("pod_resources").select("id, gym").eq("id", resourceId).maybeSingle(),
  ]);

  if (memberResult.error) throw memberResult.error;
  if (resourceResult.error) throw resourceResult.error;
  if (!memberResult.data || memberResult.data.gym !== gym) return { status: "not_found" };
  if (!resourceResult.data || resourceResult.data.gym !== gym) return { status: "not_found" };

  const { data, error } = await admin.rpc("create_booking", {
    p_member_id: memberId,
    p_resource_id: resourceId,
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
    .select("id, member_id, resource_id, slot_start, status, members(name)")
    .eq("gym", gym)
    .eq("status", "booked")
    .gte("slot_start", start.toISOString())
    .lt("slot_start", endExclusive.toISOString())
    .order("slot_start")
    .returns<
      { id: number; member_id: number; resource_id: number; slot_start: string; status: PodBooking["status"]; members: { name: string } | null }[]
    >();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.members?.name ?? "Unknown member",
    resourceId: row.resource_id,
    slotStart: row.slot_start,
    status: row.status,
  }));
}

export interface WaitlistCount {
  resourceId: number;
  slotStart: string;
  count: number;
}

/** Same one-query-per-range-load shape as getBookingsForGymAndRange, so the Calendar grid can show a waiting count per slot without a click-through. Keyed by resourceId+slotStart — two resources sharing a slot_start must not merge counts. */
export async function getWaitlistCountsForGymAndRange(gym: GymName, start: Date, endExclusive: Date): Promise<WaitlistCount[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("waitlist_entries")
    .select("resource_id, slot_start")
    .eq("gym", gym)
    .eq("status", "waiting")
    .gte("slot_start", start.toISOString())
    .lt("slot_start", endExclusive.toISOString())
    .returns<{ resource_id: number; slot_start: string }[]>();

  if (error) throw error;

  const counts = new Map<string, { resourceId: number; slotStart: string; count: number }>();
  for (const row of data ?? []) {
    const key = `${row.resource_id}|${row.slot_start}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { resourceId: row.resource_id, slotStart: row.slot_start, count: 1 });
    }
  }
  return Array.from(counts.values());
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

/**
 * Powers the Calendar's click-a-slot panel: who's booked (any status, so
 * a cancelled row is still visible for context) and who's waiting, for
 * one exact resource+slot. gym is required and filtered on directly
 * (bookings/waitlist_entries both still carry their own gym column) —
 * without it, a resourceId belonging to a *different* gym than the
 * caller's resolved scope would leak that gym's slot detail, since
 * resourceId alone carries no ownership check back to the caller's own
 * gym scope.
 */
export async function getSlotDetail(gym: GymName, resourceId: number, slotStartIso: string): Promise<SlotDetail> {
  const admin = createAdminClient();

  const [bookingsResult, waitlistResult] = await Promise.all([
    admin
      .from("bookings")
      .select("id, member_id, status, members(name)")
      .eq("gym", gym)
      .eq("resource_id", resourceId)
      .eq("slot_start", slotStartIso)
      .returns<{ id: number; member_id: number; status: PodBooking["status"]; members: { name: string } | null }[]>(),
    admin
      .from("waitlist_entries")
      .select("member_id, members(name)")
      .eq("gym", gym)
      .eq("resource_id", resourceId)
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

export type GrantCreditResult =
  | { status: "ok"; newBalance: number }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Staff comp/correction from the member profile page — e.g. a member paid
 * outside Stripe, or a booking issue needs manually resolving. Uses the
 * same 'manual_grant' reason the create_booking()/cancel_booking() RPCs
 * already write for their own credit/refund rows (0009_pod_booking.sql),
 * just via a direct insert since there's no RPC-level invariant to
 * enforce here beyond the ledger being append-only. The member's real gym
 * is looked up server-side (never trusts a client-supplied gym for the
 * member itself), matching cancelBookingAsStaff's ownership-check pattern.
 * creditType defaults to 'pod' — Milestone 1 never grants anything else;
 * Brighton's Recovery-credit grants pass it explicitly once that exists.
 */
export async function grantCreditToMember(
  gym: GymName,
  memberId: number,
  amount: number,
  actor: StaffActor,
  catalogItemId?: string,
  creditType = "pod"
): Promise<GrantCreditResult> {
  const admin = createAdminClient();
  const { data: member, error: lookupError } = await admin
    .from("members")
    .select("id, gym")
    .eq("id", memberId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!member || member.gym !== gym) return { status: "not_found" };

  const { error: insertError } = await admin
    .from("credits")
    .insert({ member_id: memberId, amount, reason: "manual_grant", catalog_item_id: catalogItemId ?? null, credit_type: creditType });
  if (insertError) return { status: "error", message: insertError.message };

  const { data: balance, error: balanceError } = await admin.rpc("get_credit_balance", {
    p_member_id: memberId,
    p_credit_type: creditType,
  });
  if (balanceError) throw balanceError;

  // Found in the 2026-08-16 OWASP audit: this is a real money-adjacent
  // action (free credits bypassing Stripe entirely) with no prior record of
  // which staff account performed it. auth_events.detail carries the target
  // since members aren't Supabase Auth accounts themselves.
  await logAuthEvent({
    email: actor.email,
    userId: actor.userId,
    eventType: "staff_credit_grant",
    detail: JSON.stringify({ gym, memberId, amount, creditType }),
  });

  return { status: "ok", newBalance: (balance as number) ?? 0 };
}

export type SetFoundingMemberResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

/**
 * Hove's Founding Member offer — staff-granted only, never automatic on a
 * purchase (see 0043_founding_member.sql's own comment: Combo Silver stays
 * a normal purchasable tier after the founding window closes too, so
 * buying it can't be what triggers this). Revocation on membership
 * cancellation happens separately, in the Stripe webhook (podhq-client),
 * matching this project's existing pattern of Stripe-driven state changes
 * always being written from the webhook, not the cancel-request route.
 */
export async function setFoundingMember(gym: GymName, memberId: number, foundingMember: boolean, actor: StaffActor): Promise<SetFoundingMemberResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("members")
    .update({ founding_member: foundingMember })
    .eq("id", memberId)
    .eq("gym", gym)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };

  await logAuthEvent({
    email: actor.email,
    userId: actor.userId,
    eventType: "staff_founding_member_set",
    detail: JSON.stringify({ gym, memberId, foundingMember }),
  });

  return { status: "ok" };
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
