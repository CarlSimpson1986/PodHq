import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const LIMIT_PER_MINUTE = 100;

/**
 * Sliding-window-by-minute rate limiter backed by the rate_limits table.
 * Buckets by (user_id, route, minute) so it's a plain upsert + compare —
 * no external cache needed at this app's scale (~10 users).
 */
export async function checkRateLimit(
  userId: string,
  route: string
): Promise<{ allowed: boolean }> {
  const admin = createAdminClient();
  const windowStart = new Date();
  windowStart.setSeconds(0, 0);

  const { data, error } = await admin
    .from("rate_limits")
    .select("request_count")
    .eq("user_id", userId)
    .eq("route", route)
    .eq("window_start", windowStart.toISOString())
    .maybeSingle();

  if (error) {
    console.error("[rate-limit] read failed, failing open", { route, error: error.message });
    return { allowed: true };
  }

  if (!data) {
    await admin.from("rate_limits").insert({
      user_id: userId,
      route,
      window_start: windowStart.toISOString(),
      request_count: 1,
    });
    return { allowed: true };
  }

  if (data.request_count >= LIMIT_PER_MINUTE) {
    return { allowed: false };
  }

  await admin
    .from("rate_limits")
    .update({ request_count: data.request_count + 1 })
    .eq("user_id", userId)
    .eq("route", route)
    .eq("window_start", windowStart.toISOString());

  return { allowed: true };
}
