import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { createExerciseVideoUploadUrl } from "@/lib/data/exercise-videos";
import { createUploadUrlSchema } from "@/lib/validation/exercise-videos";
import { checkRateLimit } from "@/lib/rate-limit";

// Returns a short-lived signed upload URL + token the admin's browser
// uploads the actual video file to *directly* — video files are too large
// for a normal API route body (Vercel's serverless function request-body
// limit is far smaller than a real video), so the file bytes never pass
// through this server at all, only this authorization step does. Scoped
// narrowly and deliberately, discussed with Carl 2026-09-04 — the one
// exception to "no client-side Supabase calls", limited to this signed
// upload action, never a database query.
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/exercise-videos/upload-url");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createUploadUrlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const result = await createExerciseVideoUploadUrl(parsed.data.exerciseKey);
    if (result.status === "error") {
      console.error("[api/exercise-videos/upload-url]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not start upload." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", signedUrl: result.signedUrl, token: result.token, path: result.path });
  } catch (err) {
    console.error("[api/exercise-videos/upload-url]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
