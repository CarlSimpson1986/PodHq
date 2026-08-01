import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { clearMarketingData } from "@/lib/data/marketing";
import { clearMarketingDataSchema } from "@/lib/validation/marketing";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Hard-deletes every ad_spend row and every lead for one gym — a full
 * reset of the Marketing page's data, not a soft delete/archive. Scoped to
 * a single gym like every other write in this app (owner locked to their
 * own, admin must pick one) — there is deliberately no "clear every gym at
 * once" action.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/marketing/clear");
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
    const parsed = clearMarketingDataSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    let gym;
    if (scope.role === "owner") {
      gym = scope.gym;
    } else {
      if (!parsed.data.gym) {
        return NextResponse.json({ status: "error", message: "A gym must be selected." }, { status: 400 });
      }
      gym = parsed.data.gym;
    }

    const result = await clearMarketingData(gym);
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    console.error("[api/marketing/clear]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong clearing this data. Try again." },
      { status: 500 }
    );
  }
}
