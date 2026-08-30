import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listCardioEquipment, createCardioEquipment } from "@/lib/data/cardio-equipment";
import { createCardioEquipmentSchema } from "@/lib/validation/cardio-equipment";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

// Owner manages their own gym's cardio equipment; admin has fallback
// access to whichever gym they select — same pattern as the pricing
// catalog (api/setup/catalog), not an admin-only design.
export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/cardio-equipment");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json({ status: "error", message: "No gym or role is assigned to this account." }, { status: 403 });
    }

    const gym = resolveGym(scope, request.nextUrl.searchParams.get("gym"));
    if (!gym) {
      return NextResponse.json({ status: "ok", gym: null, items: [] });
    }

    const items = await listCardioEquipment(gym);
    return NextResponse.json({ status: "ok", gym, items });
  } catch (err) {
    console.error("[api/setup/cardio-equipment GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load the equipment list." }, { status: 500 });
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

  const rateLimit = await checkRateLimit(user.id, "/api/setup/cardio-equipment");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json({ status: "error", message: "No gym or role is assigned to this account." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createCardioEquipmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (!gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    const result = await createCardioEquipment(gym, parsed.data.name);
    if (result.status === "error") {
      console.error("[api/setup/cardio-equipment POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not add this equipment." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", item: result.item });
  } catch (err) {
    console.error("[api/setup/cardio-equipment POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
