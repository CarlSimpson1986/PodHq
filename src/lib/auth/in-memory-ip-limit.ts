import "server-only";

/**
 * Lightweight in-memory sliding-window limiter for pre-auth routes that
 * have no existing audit-log event to piggyback on (unlike magic-link,
 * which already logs magic_link_sent and can count those). Deliberately
 * not DB-backed: this app runs as a single process at dev/small-team
 * scale, so a per-process Map is enough, and it avoids adding a new table
 * or auth_events enum value just for one low-severity secondary defense
 * layer — the real protection for this route is Supabase's own
 * cryptographic validation of the code/token itself, this is defense in
 * depth on top of that, not the primary guard.
 */
const attempts = new Map<string, number[]>();

export function checkInMemoryIpLimit(key: string, limit: number, windowMs: number): { allowed: boolean } {
  const now = Date.now();
  const windowStart = now - windowMs;
  const recent = (attempts.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= limit) {
    attempts.set(key, recent);
    return { allowed: false };
  }

  recent.push(now);
  attempts.set(key, recent);
  return { allowed: true };
}
