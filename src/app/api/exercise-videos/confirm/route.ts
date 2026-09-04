import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { confirmExerciseVideoUpload } from "@/lib/data/exercise-videos";
import { confirmUploadSchema } from "@/lib/validation/exercise-videos";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuthEvent } from "@/lib/audit";

// Called by the browser once its direct upload to the signed URL (see
// upload-url/route.ts) has actually succeeded — this is what writes the
// exercise_video_overrides row and cleans up the previous file on a
// replace. A failed/abandoned client-side upload never reaches this route,
// so it just never gets recorded — no orphaned DB row for a file that was
// never actually stored.
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/exercise-videos/confirm");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = confirmUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const result = await confirmExerciseVideoUpload(parsed.data.exerciseKey, parsed.data.path, user.id);
    if (result.status === "error") {
      console.error("[api/exercise-videos/confirm]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not save this video." }, { status: 500 });
    }

    await logAuthEvent({
      email: user.email ?? "",
      userId: user.id,
      eventType: "exercise_video_uploaded",
      detail: JSON.stringify({ exerciseKey: parsed.data.exerciseKey }),
    });

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/exercise-videos/confirm]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
