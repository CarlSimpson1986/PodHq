import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getRevenueSummaryForRange } from "@/lib/data/revenue";
import { revenueSummaryQuerySchema } from "@/lib/validation/revenue";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/revenue/summary");
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
    const parsed = revenueSummaryQuerySchema.safeParse({
      preset: searchParams.get("preset") ?? undefined,
      year: searchParams.get("year") ?? undefined,
      gym: searchParams.get("gym") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid query parameters." }, { status: 400 });
    }

    // Security: an owner only ever sees their own gym, regardless of what a
    // client sends — only an admin's gym selection is actually honoured.
    const gym = scope.role === "owner" ? scope.gym : (parsed.data.gym ?? null);

    const summary = await getRevenueSummaryForRange(gym, parsed.data.preset, parsed.data.year);
    return NextResponse.json({ status: "ok", role: scope.role, gym, summary });
  } catch (err) {
    // A transient failure (token-refresh race, DB blip) — distinct from
    // "no gym assigned", which is a real, permanent account state. Client
    // should offer retry, not tell the user their account is misconfigured.
    console.error("[api/revenue/summary]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong loading revenue data. Try again." },
      { status: 500 }
    );
  }
}
