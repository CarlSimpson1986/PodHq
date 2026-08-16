import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { cancelBookingAsStaff } from "@/lib/data/pods";
import { cancelBookingSchema } from "@/lib/validation/pods";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/pods/bookings/cancel");
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
    const parsed = cancelBookingSchema.safeParse(body);
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

    const result = await cancelBookingAsStaff(gym, parsed.data.bookingId);

    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Booking not found." }, { status: 404 });
    }
    if (result.status === "already_cancelled") {
      return NextResponse.json({ status: "error", message: "This booking is already cancelled." }, { status: 409 });
    }
    if (result.status === "error") {
      console.error("[api/pods/bookings/cancel POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not cancel booking." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", refunded: result.refunded });
  } catch (err) {
    console.error("[api/pods/bookings/cancel POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
