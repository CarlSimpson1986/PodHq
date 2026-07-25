import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { resolveNextAuthStep } from "@/lib/auth/next-step";

/**
 * Lands here after clicking an invite, password-recovery, or magic-link
 * email. Exchanges the one-time code for a session, then routes the user
 * to set a password (invite/recovery) or through the normal post-auth
 * MFA gate (magic link).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  if (type === "invite" || type === "recovery") {
    return NextResponse.redirect(`${origin}/login/set-password`);
  }

  const nextStep = await resolveNextAuthStep(supabase, data.user.id);
  if (nextStep === "mfa_setup_required") {
    return NextResponse.redirect(`${origin}/login/mfa-setup`);
  }
  if (nextStep === "mfa_required") {
    return NextResponse.redirect(`${origin}/login/mfa`);
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}
