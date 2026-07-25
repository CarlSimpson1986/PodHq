import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { magicLinkSchema } from "@/lib/validation/auth";
import { logAuthEvent } from "@/lib/audit";
import { getRequestIp } from "@/lib/request-ip";

// Always the same response, whether or not the email matches an account —
// this endpoint must not be usable to enumerate registered users.
const GENERIC_MESSAGE = "If an account exists for that email, a login link has been sent.";

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }

  const parsed = magicLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Enter a valid email address." }, { status: 400 });
  }
  const { email } = parsed.data;

  const supabase = await createSessionClient();
  const origin = request.nextUrl.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  await logAuthEvent({
    email,
    eventType: "magic_link_sent",
    ipAddress: ip,
    detail: error?.message,
  });

  return NextResponse.json({ status: "ok", message: GENERIC_MESSAGE });
}
