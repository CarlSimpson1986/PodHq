import type { NextRequest } from "next/server";

/** Best-effort client IP for audit logging — trusts Vercel's forwarded header. */
export function getRequestIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}
