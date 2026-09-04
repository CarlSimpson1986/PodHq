import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getExerciseVideoOverrides } from "@/lib/data/exercise-videos";
import { checkRateLimit } from "@/lib/rate-limit";

// Admin-only — exercise videos are franchise-wide content, not a gym's own
// config, so this deliberately isn't under /setup's per-gym flow.
export async function GET() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/exercise-videos");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const overrides = await getExerciseVideoOverrides();
    return NextResponse.json({ status: "ok", overrides });
  } catch (err) {
    console.error("[api/exercise-videos GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load exercise videos." }, { status: 500 });
  }
}
