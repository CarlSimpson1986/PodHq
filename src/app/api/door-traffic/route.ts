import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getDoorTraffic } from "@/lib/data/door-traffic";
import { doorTrafficQuerySchema } from "@/lib/validation/door-traffic";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/door-traffic");
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

    const { searchParams } = request.nextUrl;
    const parsed = doorTrafficQuerySchema.safeParse({
      preset: searchParams.get("preset") ?? undefined,
      gym: searchParams.get("gym") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid query parameters." }, { status: 400 });
    }

    // An owner only ever sees their own gym — only an admin's gym choice
    // is honoured, same as /api/revenue/summary.
    const gym = scope.role === "owner" ? scope.gym : (parsed.data.gym ?? null);
    const summary = await getDoorTraffic(gym, parsed.data.preset);
    return NextResponse.json({ status: "ok", gym, summary });
  } catch (err) {
    console.error("[api/door-traffic]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load door traffic." }, { status: 500 });
  }
}
