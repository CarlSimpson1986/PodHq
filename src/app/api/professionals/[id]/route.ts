import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { updateProfessional, deleteProfessional } from "@/lib/data/professionals";
import { upsertProfessionalSchema } from "@/lib/validation/professionals";
import { checkRateLimit } from "@/lib/rate-limit";

async function requireAdmin(userId: string) {
  const scope = await getGymScope(userId);
  if (!scope || scope.role !== "admin") {
    return { error: NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 }) };
  }
  return { error: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/professionals/[id]");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const { error } = await requireAdmin(user.id);
    if (error) return error;

    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ status: "error", message: "Invalid item." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = upsertProfessionalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const result = await updateProfessional(itemId, { ...parsed.data, photoUrl: parsed.data.photoUrl ?? "" });
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Professional not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/professionals/[id] PATCH]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not update this professional." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/professionals/[id] PATCH]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/professionals/[id]");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const { error } = await requireAdmin(user.id);
    if (error) return error;

    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ status: "error", message: "Invalid item." }, { status: 400 });
    }

    const result = await deleteProfessional(itemId);
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Professional not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/professionals/[id] DELETE]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not delete this professional." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/professionals/[id] DELETE]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
