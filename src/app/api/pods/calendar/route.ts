import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getBookingsForGymAndRange, getWaitlistCountsForGymAndRange } from "@/lib/data/pods";
import { podCalendarQuerySchema } from "@/lib/validation/pods";
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

  const rateLimit = await checkRateLimit(user.id, "/api/pods/calendar");
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

    const parsed = podCalendarQuerySchema.safeParse({
      gym: request.nextUrl.searchParams.get("gym") ?? undefined,
      start: request.nextUrl.searchParams.get("start") ?? undefined,
      end: request.nextUrl.searchParams.get("end") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (!gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    const rangeStart = new Date(`${parsed.data.start}T00:00:00`);
    const rangeEnd = new Date(`${parsed.data.end}T00:00:00`);
    const [bookings, waitlist] = await Promise.all([
      getBookingsForGymAndRange(gym, rangeStart, rangeEnd),
      getWaitlistCountsForGymAndRange(gym, rangeStart, rangeEnd),
    ]);
    return NextResponse.json({ status: "ok", bookings, waitlist });
  } catch (err) {
    console.error("[api/pods/calendar GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
