import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";
import { logAuthEvent } from "@/lib/audit";
import { checkLoginLockout } from "@/lib/auth/lockout";
import { resolveNextAuthStep } from "@/lib/auth/next-step";
import { getRequestIp } from "@/lib/request-ip";

const GENERIC_ERROR = "Invalid email or password.";

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: GENERIC_ERROR }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: GENERIC_ERROR }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const lockout = await checkLoginLockout(email, ip);
  if (lockout.locked) {
    if (lockout.reason === "account_locked") {
      await logAuthEvent({ email, eventType: "account_locked", ipAddress: ip });
      return NextResponse.json(
        { status: "error", message: "This account is locked. Contact your admin to reset it." },
        { status: 423 }
      );
    }
    return NextResponse.json(
      { status: "error", message: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await logAuthEvent({ email, eventType: "login_failure", ipAddress: ip, detail: error?.message });
    return NextResponse.json({ status: "error", message: GENERIC_ERROR }, { status: 401 });
  }

  await logAuthEvent({ email, userId: data.user.id, eventType: "login_success", ipAddress: ip });

  const nextStep = await resolveNextAuthStep(supabase);
  return NextResponse.json({ status: nextStep });
}
