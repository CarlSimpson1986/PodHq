import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getMembersForGym } from "@/lib/data/pods";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { checkRateLimit } from "@/lib/rate-limit";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/pods/members");
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

    const members = await getMembersForGym(gym);
    return NextResponse.json({ status: "ok", members });
  } catch (err) {
    console.error("[api/pods/members]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
