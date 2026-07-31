import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { resetUserLockout } from "@/lib/data/admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/admin/users/[id]/unlock");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const { id: targetUserId } = await params;
    await resetUserLockout(targetUserId);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/admin/users/[id]/unlock POST]", {
      userId: user.id,
      error: err instanceof Error ? err.message : err,
    });
    return NextResponse.json(
      { status: "error", message: "Could not clear lockout. Try again." },
      { status: 500 }
    );
  }
}
