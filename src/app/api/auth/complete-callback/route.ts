import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { resolveNextAuthStep } from "@/lib/auth/next-step";
import { checkInMemoryIpLimit } from "@/lib/auth/in-memory-ip-limit";
import { getRequestIp } from "@/lib/request-ip";

const IP_LIMIT = 20;
const IP_WINDOW_MS = 15 * 60_000;

/**
 * Finishes an auth callback started client-side (see /auth/callback).
 * Accepts either shape a Supabase email link can produce:
 * - { code } — PKCE, used by our own server-initiated magic links.
 * - { accessToken, refreshToken } — implicit flow, used by admin-issued
 *   invite/recovery links (no browser session exists to hold a PKCE
 *   verifier for those, so Supabase always uses hash-fragment tokens).
 */
export async function POST(request: NextRequest) {
  const ip = getRequestIp(request) ?? "unknown";
  const rateLimit = checkInMemoryIpLimit(`complete-callback:${ip}`, IP_LIMIT, IP_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error" }, { status: 429 });
  }

  const supabase = await createSessionClient();

  let body: { code?: string; accessToken?: string; refreshToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error" }, { status: 400 });
  }

  const result = body.accessToken && body.refreshToken
    ? await supabase.auth.setSession({
        access_token: body.accessToken,
        refresh_token: body.refreshToken,
      })
    : body.code
      ? await supabase.auth.exchangeCodeForSession(body.code)
      : { data: { user: null }, error: null };

  if (result.error || !result.data.user) {
    return NextResponse.json({ status: "error" }, { status: 400 });
  }

  const nextStep = await resolveNextAuthStep(supabase);
  return NextResponse.json({ status: "ok", nextStep });
}
