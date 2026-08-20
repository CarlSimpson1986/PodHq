import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listCoupons, createCoupon } from "@/lib/data/coupons";
import { createCouponSchema } from "@/lib/validation/coupons";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

// Same access pattern as /api/setup/catalog — business/pricing config,
// owner manages their own gym, admin has fallback access to whichever
// gym they select. Not the admin-only pattern (Brevo/Resend) since a
// coupon is a pricing decision, not a credential.
export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/coupons");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json(
        { status: "error", message: "No gym or role is assigned to this account." },
        { status: 403 }
      );
    }

    const gym = resolveGym(scope, request.nextUrl.searchParams.get("gym"));
    if (!gym) {
      return NextResponse.json({ status: "ok", gym: null, coupons: [] });
    }

    const coupons = await listCoupons(gym);
    return NextResponse.json({ status: "ok", gym, coupons });
  } catch (err) {
    console.error("[api/setup/coupons GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load coupons." }, { status: 500 });
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

  const rateLimit = await checkRateLimit(user.id, "/api/setup/coupons");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
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
    const parsed = createCouponSchema.safeParse(body);
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

    const result = await createCoupon({ ...parsed.data, gym });
    if (result.status === "duplicate_code") {
      return NextResponse.json({ status: "error", message: "That code is already in use for this gym." }, { status: 409 });
    }
    if (result.status === "error") {
      console.error("[api/setup/coupons POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not create this coupon." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", coupon: result.coupon });
  } catch (err) {
    console.error("[api/setup/coupons POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
