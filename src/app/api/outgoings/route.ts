import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { insertOutgoing } from "@/lib/data/outgoings";
import { createOutgoingSchema } from "@/lib/validation/outgoings";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/outgoings");
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
    const parsed = createOutgoingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    // Security: an owner can only ever write to their own gym, regardless
    // of what a client sends. An admin must specify which gym they're
    // entering on behalf of — there's no gym to default to.
    let gym;
    if (scope.role === "owner") {
      gym = scope.gym;
    } else {
      if (!parsed.data.gym) {
        return NextResponse.json({ status: "error", message: "A gym must be selected." }, { status: 400 });
      }
      gym = parsed.data.gym;
    }

    await insertOutgoing(gym, parsed.data.category, parsed.data.amountGbp, parsed.data.effectiveFrom, user.id);

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/outgoings]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong saving this entry. Try again." },
      { status: 500 }
    );
  }
}
