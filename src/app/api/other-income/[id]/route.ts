import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { deleteOtherIncome } from "@/lib/data/other-income";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { checkRateLimit } from "@/lib/rate-limit";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/other-income/[id]");
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
      return NextResponse.json({ status: "error", message: "Invalid entry id." }, { status: 400 });
    }

    // Security: an owner can only ever delete their own gym's entries. An
    // admin must specify which gym they're deleting on behalf of via the
    // `gym` query param — same "fallback edit access" convention as insert.
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

    const deleted = await deleteOtherIncome(id, gym);
    if (!deleted) {
      return NextResponse.json({ status: "error", message: "Entry not found for this gym." }, { status: 404 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/other-income/[id]]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong deleting this entry. Try again." },
      { status: 500 }
    );
  }
}
