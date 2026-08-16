import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getBookingsForGymAndDate, createManualBooking } from "@/lib/data/pods";
import { podBookingsQuerySchema, createManualBookingSchema } from "@/lib/validation/pods";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/pods/bookings");
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

    const parsed = podBookingsQuerySchema.safeParse({
      gym: request.nextUrl.searchParams.get("gym") ?? undefined,
      date: request.nextUrl.searchParams.get("date") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (!gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    const bookings = await getBookingsForGymAndDate(gym, new Date(`${parsed.data.date}T00:00:00`));
    return NextResponse.json({ status: "ok", bookings });
  } catch (err) {
    console.error("[api/pods/bookings GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
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

  const rateLimit = await checkRateLimit(user.id, "/api/pods/bookings");
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
    const parsed = createManualBookingSchema.safeParse(body);
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

    const result = await createManualBooking(gym, parsed.data.memberId, parsed.data.slotStart);

    if (result.status === "insufficient_credits") {
      return NextResponse.json(
        { status: "error", message: "This member doesn't have enough credits. Grant one first." },
        { status: 409 }
      );
    }
    if (result.status === "slot_full") {
      return NextResponse.json({ status: "error", message: "That slot is already at capacity." }, { status: 409 });
    }
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Member not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/pods/bookings POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not create booking." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", bookingId: result.bookingId });
  } catch (err) {
    console.error("[api/pods/bookings POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
