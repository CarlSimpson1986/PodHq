import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "@/lib/data/types";

// Admin-only PT directory ("Find a Professional", podhq-client) — Carl's
// own placeholder-then-real trainer roster, same reasoning as
// help-faq.ts for why this is franchisor-level admin-only data rather
// than per-gym owner-editable. See 0066_professionals.sql.
export interface Professional {
  id: number;
  name: string;
  photoUrl: string | null;
  bio: string;
  qualifications: string;
  specialties: string[];
  gyms: GymName[];
  pricePerHourGbp: number;
  active: boolean;
  displayOrder: number;
  updatedAt: string;
}

function mapRow(row: Record<string, unknown>): Professional {
  return {
    id: row.id as number,
    name: row.name as string,
    photoUrl: (row.photo_url as string | null) ?? null,
    bio: row.bio as string,
    qualifications: row.qualifications as string,
    specialties: (row.specialties as string[] | null) ?? [],
    gyms: (row.gyms as GymName[] | null) ?? [],
    pricePerHourGbp: Number(row.price_per_hour_gbp),
    active: row.active as boolean,
    displayOrder: row.display_order as number,
    updatedAt: row.updated_at as string,
  };
}

const SELECT_COLUMNS =
  "id, name, photo_url, bio, qualifications, specialties, gyms, price_per_hour_gbp, active, display_order, updated_at";

export async function listProfessionals(): Promise<Professional[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("professionals")
    .select(SELECT_COLUMNS)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

interface ProfessionalInput {
  name: string;
  photoUrl: string;
  bio: string;
  qualifications: string;
  specialties: string[];
  gyms: GymName[];
  pricePerHourGbp: number;
  active: boolean;
  displayOrder: number;
}

function toRow(input: ProfessionalInput) {
  return {
    name: input.name,
    photo_url: input.photoUrl || null,
    bio: input.bio,
    qualifications: input.qualifications,
    specialties: input.specialties,
    gyms: input.gyms,
    price_per_hour_gbp: input.pricePerHourGbp,
    active: input.active,
    display_order: input.displayOrder,
  };
}

export type CreateProfessionalResult = { status: "ok"; item: Professional } | { status: "error"; message: string };

export async function createProfessional(input: ProfessionalInput): Promise<CreateProfessionalResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("professionals").insert(toRow(input)).select(SELECT_COLUMNS).single();

  if (error) return { status: "error", message: error.message };
  return { status: "ok", item: mapRow(data) };
}

export type UpdateProfessionalResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

export async function updateProfessional(id: number, input: ProfessionalInput): Promise<UpdateProfessionalResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("professionals")
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}

export type DeleteProfessionalResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

export async function deleteProfessional(id: number): Promise<DeleteProfessionalResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("professionals").delete().eq("id", id).select("id").maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}

export interface ProfessionalInquiry {
  id: number;
  professionalId: number;
  professionalName: string;
  memberId: number;
  memberName: string;
  message: string;
  createdAt: string;
}

// Recent-first, capped — this is a review list for Carl to action, not an
// archive; same "last 40 messages" reasoning coach-conversations.ts gives
// for bounding an unbounded-growth list to what's actually useful to see.
const RECENT_INQUIRIES_LIMIT = 50;

export async function listRecentInquiries(): Promise<ProfessionalInquiry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("professional_inquiries")
    .select("id, professional_id, member_id, message, created_at, professionals(name), members(name)")
    .order("created_at", { ascending: false })
    .limit(RECENT_INQUIRIES_LIMIT);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as number,
    professionalId: row.professional_id as number,
    professionalName: (row.professionals as unknown as { name: string } | null)?.name ?? "(removed)",
    memberId: row.member_id as number,
    memberName: (row.members as unknown as { name: string } | null)?.name ?? "(unknown)",
    message: row.message as string,
    createdAt: row.created_at as string,
  }));
}
