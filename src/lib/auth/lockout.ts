import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const SOFT_LOCK_WINDOW_MINUTES = 15;
const SOFT_LOCK_THRESHOLD = 5;
const HARD_LOCK_THRESHOLD = 10;

const MAGIC_LINK_WINDOW_MINUTES = 15;
const MAGIC_LINK_PER_EMAIL_LIMIT = 3;
const MAGIC_LINK_PER_IP_LIMIT = 10;

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

/**
 * MFA code verification has the same brute-force exposure login passwords
 * do — arguably worse, since a TOTP code is only 6 digits — so it needs the
 * same throttling. Keyed by user_id rather than email: unlike login, this
 * only ever runs against an already-authenticated session (post-password,
 * pre-MFA), so a stable user_id is already available and is a tighter key
 * than email. "Since last success" resets on either mfa_challenge_success
 * (an ongoing login's MFA step) or mfa_enrolled (first-time setup) — both
 * are this flow's equivalent of login_success.
 */
export async function checkMfaLockout(userId: string): Promise<LockoutState> {
  const admin = createAdminClient();

  const since = new Date(Date.now() - SOFT_LOCK_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentFailures } = await admin
    .from("auth_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "mfa_challenge_failure")
    .gte("created_at", since);

  if ((recentFailures ?? 0) >= SOFT_LOCK_THRESHOLD) {
    return { locked: true, reason: "too_many_recent_attempts" };
  }

  const { data: lastSuccessRows } = await admin
    .from("auth_events")
    .select("created_at")
    .eq("user_id", userId)
    .in("event_type", ["mfa_challenge_success", "mfa_enrolled"])
    .order("created_at", { ascending: false })
    .limit(1);

  const lastSuccessAt = lastSuccessRows?.[0]?.created_at;

  let failuresSinceSuccess = admin
    .from("auth_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "mfa_challenge_failure");

  if (lastSuccessAt) {
    failuresSinceSuccess = failuresSinceSuccess.gt("created_at", lastSuccessAt);
  }

  const { count: totalFailures } = await failuresSinceSuccess;

  if ((totalFailures ?? 0) >= HARD_LOCK_THRESHOLD) {
    return { locked: true, reason: "account_locked" };
  }

  return { locked: false };
}

/**
 * Magic-link requests are pre-auth (no user_id to key on, unlike login's
 * password attempts) and the endpoint always returns the same generic
 * message regardless of whether the email exists — so the abuse vector
 * here isn't credential guessing, it's spam: emailing unwanted login
 * links to a victim's inbox, or spraying many addresses from one source.
 * Backed by the `magic_link_sent` events the route already logs on every
 * request, so this needs no new table/column. Two independent caps: a
 * tight per-email limit (stop hammering one inbox) and a looser per-IP
 * limit (stop spraying many different addresses from one source) — this
 * app has ~10 real users, so even the looser cap won't bother anyone
 * legitimate.
 */
export async function checkMagicLinkRateLimit(email: string, ip: string | null): Promise<{ allowed: boolean }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - MAGIC_LINK_WINDOW_MINUTES * 60_000).toISOString();

  const { count: emailCount } = await admin
    .from("auth_events")
    .select("*", { count: "exact", head: true })
    .eq("user_email", email)
    .eq("event_type", "magic_link_sent")
    .gte("created_at", since);

  if ((emailCount ?? 0) >= MAGIC_LINK_PER_EMAIL_LIMIT) {
    return { allowed: false };
  }

  if (ip) {
    const { count: ipCount } = await admin
      .from("auth_events")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("event_type", "magic_link_sent")
      .gte("created_at", since);

    if ((ipCount ?? 0) >= MAGIC_LINK_PER_IP_LIMIT) {
      return { allowed: false };
    }
  }

  return { allowed: true };
}
