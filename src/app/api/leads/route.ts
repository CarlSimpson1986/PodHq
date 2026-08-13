import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getRecentLeads } from "@/lib/data/marketing";
import { leadsQuerySchema } from "@/lib/validation/leads";
import { checkRateLimit } from "@/lib/rate-limit";

// Lets an admin switch gyms on /leads without a full page reload — same
// refetch-on-gym-change shape as /api/marketing/summary.
export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/leads");
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
    const parsed = leadsQuerySchema.safeParse({ gym: searchParams.get("gym") ?? undefined });
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid query parameters." }, { status: 400 });
    }

    // Security: an owner only ever sees their own gym, regardless of what a
    // client sends — only an admin's gym selection is actually honoured.
    const gym = scope.role === "owner" ? scope.gym : (parsed.data.gym ?? null);

    const leads = gym ? await getRecentLeads(gym) : null;
    return NextResponse.json({ status: "ok", role: scope.role, gym, leads });
  } catch (err) {
    console.error("[api/leads]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong loading leads. Try again." },
      { status: 500 }
    );
  }
}
