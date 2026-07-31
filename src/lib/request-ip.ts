import type { NextRequest } from "next/server";

/**
 * Best-effort client IP for audit logging and rate limiting.
 *
 * x-vercel-forwarded-for over x-forwarded-for: Vercel overwrites
 * x-forwarded-for itself with the real client IP and never forwards an
 * external value (see Vercel's request-headers docs), so on Vercel either
 * header is spoof-proof — but x-vercel-forwarded-for stays reliable even
 * if another proxy (e.g. Cloudflare) ever gets added in front of Vercel
 * and rewrites x-forwarded-for downstream. Falls back to the last
 * x-forwarded-for entry for environments without either Vercel header
 * (e.g. local dev), on the standard "trust only the hop your own proxy
 * appended" rule.
 */
export function getRequestIp(request: NextRequest): string | null {
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return request.headers.get("x-real-ip");
}
