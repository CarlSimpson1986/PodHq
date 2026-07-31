import type { NextRequest } from "next/server";

/**
 * Best-effort client IP for audit logging and rate limiting.
 * Takes the LAST x-forwarded-for entry, not the first — that's the hop
 * Vercel's edge itself appends, so it can't be spoofed by a client sending
 * its own x-forwarded-for header (which would land earlier in the list).
 */
export function getRequestIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return request.headers.get("x-real-ip");
}
