import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Deliberately unauthenticated and unrated-limited — an external uptime
// monitor (UptimeRobot/Better Uptime/etc.) needs to hit this without a
// session, on a short interval, from an IP that isn't the app's own
// traffic. Listed in src/lib/supabase/middleware.ts's PUBLIC_API_EXACT_PATHS
// so the auth gate doesn't redirect it to /login. Checks real DB
// connectivity, not just "the Next.js process is up" — a page that loads
// but can't reach Supabase is not actually healthy, and that's the failure
// mode a plain "hit the homepage" monitor would miss.
export async function GET() {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("users_gyms").select("user_id", { count: "exact", head: true }).limit(1);
    if (error) throw error;

    return NextResponse.json({ status: "ok", checks: { database: "ok" }, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[api/health]", { error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", checks: { database: "error" }, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
