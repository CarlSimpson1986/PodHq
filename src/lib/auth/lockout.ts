import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const SOFT_LOCK_WINDOW_MINUTES = 15;
const SOFT_LOCK_THRESHOLD = 5;
const HARD_LOCK_THRESHOLD = 10;

export type LockoutState =
  | { locked: false }
  | { locked: true; reason: "too_many_recent_attempts" | "account_locked" };

/**
 * Login lockout is derived from auth_events rather than a stored flag:
 * 5 failures in the last 15 minutes -> temporary soft lock (the window
 * simply expires); 10 failures since the last success -> hard lock that
 * only clears once an admin resets it (i.e. a fresh login_success or a
 * future admin-reset event appears in the log).
 */
export async function checkLoginLockout(email: string): Promise<LockoutState> {
  const admin = createAdminClient();

  const since = new Date(Date.now() - SOFT_LOCK_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentFailures } = await admin
    .from("auth_events")
    .select("*", { count: "exact", head: true })
    .eq("user_email", email)
    .eq("event_type", "login_failure")
    .gte("created_at", since);

  if ((recentFailures ?? 0) >= SOFT_LOCK_THRESHOLD) {
    return { locked: true, reason: "too_many_recent_attempts" };
  }

  const { data: lastSuccessRows } = await admin
    .from("auth_events")
    .select("created_at")
    .eq("user_email", email)
    .eq("event_type", "login_success")
    .order("created_at", { ascending: false })
    .limit(1);

  const lastSuccessAt = lastSuccessRows?.[0]?.created_at;

  let failuresSinceSuccess = admin
    .from("auth_events")
    .select("*", { count: "exact", head: true })
    .eq("user_email", email)
    .eq("event_type", "login_failure");

  if (lastSuccessAt) {
    failuresSinceSuccess = failuresSinceSuccess.gt("created_at", lastSuccessAt);
  }

  const { count: totalFailures } = await failuresSinceSuccess;

  if ((totalFailures ?? 0) >= HARD_LOCK_THRESHOLD) {
    return { locked: true, reason: "account_locked" };
  }

  return { locked: false };
}
