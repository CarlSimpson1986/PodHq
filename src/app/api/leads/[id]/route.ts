import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { updateLeadStatus } from "@/lib/data/marketing";
import { updateLeadStatusSchema } from "@/lib/validation/leads";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { checkRateLimit } from "@/lib/rate-limit";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/leads/[id]");
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

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ status: "error", message: "Invalid lead id." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const parsed = updateLeadStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    // Same "owner locked to own gym, admin must specify" convention as
    // outgoings/[id]/route.ts's DELETE handler.
    let gym: GymName;
    if (scope.role === "owner") {
      gym = scope.gym;
    } else {
      const gymParam = request.nextUrl.searchParams.get("gym");
      if (!gymParam || !isGymName(gymParam)) {
        return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
      }
      gym = gymParam;
    }

    const updated = await updateLeadStatus(id, gym, parsed.data.status);
    if (!updated) {
      return NextResponse.json({ status: "error", message: "Lead not found for this gym." }, { status: 404 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/leads/[id]]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong updating this lead. Try again." },
      { status: 500 }
    );
  }
}
