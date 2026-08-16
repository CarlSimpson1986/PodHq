import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const LIMIT_PER_MINUTE = 100;

/**
 * Sliding-window-by-minute rate limiter backed by the rate_limits table.
 * Buckets by (user_id, route, minute). Goes through the increment_rate_limit
 * RPC (0034_increment_rate_limit.sql) rather than a separate select+update —
 * that read-then-write pair let two concurrent requests both pass the limit
 * check and both increment, letting a burst exceed LIMIT_PER_MINUTE (found
 * in the 2026-08-16 OWASP audit). The RPC's INSERT ... ON CONFLICT ... DO
 * UPDATE does the check-and-increment as one atomic statement instead.
 */
export async function checkRateLimit(
  userId: string,
  route: string
): Promise<{ allowed: boolean }> {
  const admin = createAdminClient();
  const windowStart = new Date();
  windowStart.setSeconds(0, 0);

  const { data, error } = await admin.rpc("increment_rate_limit", {
    p_user_id: userId,
    p_route: route,
    p_window_start: windowStart.toISOString(),
  });

  if (error) {
    console.error("[rate-limit] increment failed, failing open", { route, error: error.message });
    return { allowed: true };
  }

  return { allowed: (data as number) <= LIMIT_PER_MINUTE };
}
