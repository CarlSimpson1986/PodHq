import "server-only";
import { timingSafeEqual } from "crypto";

/**
 * Server-to-server calls from podhq-client (PDK unlock proxy, Brevo lead
 * sync) — no podHQ session exists on those requests, so they authenticate
 * with the shared secret both apps already hold. Named PDK_PROXY_SECRET
 * for historical reasons (the PDK proxy was its first use); reused rather
 * than adding a second secret that would need setting in both Vercel
 * projects and kept in step.
 */
export function isAuthorizedInternalRequest(request: Request): boolean {
  const secret = process.env.PDK_PROXY_SECRET;
  if (!secret) return false;

  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(secret);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
