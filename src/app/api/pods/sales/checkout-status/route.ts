import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getCheckoutSessionStatus } from "@/lib/data/sales";
import { salesCheckoutStatusSchema } from "@/lib/validation/sales";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/pods/sales/checkout-status");
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

    const parsed = salesCheckoutStatusSchema.safeParse({
      memberId: Number(request.nextUrl.searchParams.get("memberId")),
      sessionId: request.nextUrl.searchParams.get("sessionId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const result = await getCheckoutSessionStatus(parsed.data.sessionId, parsed.data.memberId);
    if (!result) {
      return NextResponse.json({ status: "error", message: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({ status: "ok", sessionStatus: result.status, paid: result.paid });
  } catch (err) {
    console.error("[api/pods/sales/checkout-status GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
