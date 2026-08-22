import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { setPromoCodeEnabled } from "@/lib/data/promo-codes";
import { setPromoCodeEnabledSchema } from "@/lib/validation/promo-codes";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const promoCodeId = Number(id);

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/promo-codes");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  if (!Number.isInteger(promoCodeId) || promoCodeId <= 0) {
    return NextResponse.json({ status: "error", message: "Invalid promo code." }, { status: 400 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json(
        { status: "error", message: "No gym or role is assigned to this account." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = setPromoCodeEnabledSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (!gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    const result = await setPromoCodeEnabled(gym, promoCodeId, parsed.data.enabled);
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Promo code not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/setup/promo-codes/[id] PATCH]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not update this promo code." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/setup/promo-codes/[id] PATCH]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
