import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listProfessionals, createProfessional } from "@/lib/data/professionals";
import { upsertProfessionalSchema } from "@/lib/validation/professionals";
import { checkRateLimit } from "@/lib/rate-limit";

// Admin-only, both read and write — this is franchisor-level data (one
// trainer profile shows to every gym's members via podhq-client's
// directory), same reasoning as Help FAQ's write gate, but with no
// owner-read case to carve out since there's nothing gym-scoped here.
export async function GET() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/professionals");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const items = await listProfessionals();
    return NextResponse.json({ status: "ok", items });
  } catch (err) {
    console.error("[api/professionals GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load professionals." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/professionals");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = upsertProfessionalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const result = await createProfessional({ ...parsed.data, photoUrl: parsed.data.photoUrl ?? "" });
    if (result.status === "error") {
      console.error("[api/professionals POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not create this professional." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", item: result.item });
  } catch (err) {
    console.error("[api/professionals POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
