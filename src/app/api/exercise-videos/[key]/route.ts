import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { deleteExerciseVideo } from "@/lib/data/exercise-videos";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuthEvent } from "@/lib/audit";

// Reverts an exercise back to its YouTube fallback (see podhq-client's
// exercise-catalog.ts) — deletes both the DB row and the stored file.
export async function DELETE(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/exercise-videos/[key]");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const { key } = await params;

    const result = await deleteExerciseVideo(key);
    if (result.status === "error") {
      console.error("[api/exercise-videos DELETE]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not remove this video." }, { status: 500 });
    }

    await logAuthEvent({
      email: user.email ?? "",
      userId: user.id,
      eventType: "exercise_video_deleted",
      detail: JSON.stringify({ exerciseKey: key }),
    });

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/exercise-videos DELETE]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
