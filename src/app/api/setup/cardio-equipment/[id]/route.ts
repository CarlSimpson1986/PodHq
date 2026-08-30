import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { updateCardioEquipment, setCardioEquipmentEnabled } from "@/lib/data/cardio-equipment";
import { updateCardioEquipmentSchema, setCardioEquipmentEnabledSchema } from "@/lib/validation/cardio-equipment";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/cardio-equipment/[id]");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json({ status: "error", message: "No gym or role is assigned to this account." }, { status: 403 });
    }

    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ status: "error", message: "Invalid item." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);

    // Two different edits share this route: renaming, and the simple
    // enable/disable toggle — distinguished by shape, same convention as
    // api/setup/catalog/[id]. The resolved gym is checked server-side
    // against the row's own gym, never trusted from the client alone.
    if (body && typeof body === "object" && "enabled" in body) {
      const parsed = setCardioEquipmentEnabledSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
      }
      const gym = resolveGym(scope, parsed.data.gym);
      if (!gym) {
        return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
      }
      const result = await setCardioEquipmentEnabled(gym, itemId, parsed.data.enabled);
      if (result.status === "not_found") {
        return NextResponse.json({ status: "error", message: "Equipment not found." }, { status: 404 });
      }
      if (result.status === "error") {
        console.error("[api/setup/cardio-equipment/[id] PATCH]", { userId: user.id, error: result.message });
        return NextResponse.json({ status: "error", message: "Could not update this equipment." }, { status: 500 });
      }
      return NextResponse.json({ status: "ok" });
    }

    const parsed = updateCardioEquipmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (!gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    const result = await updateCardioEquipment(gym, itemId, parsed.data.name);
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Equipment not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/setup/cardio-equipment/[id] PATCH]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not update this equipment." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/setup/cardio-equipment/[id] PATCH]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
