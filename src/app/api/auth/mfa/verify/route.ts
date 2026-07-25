import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { mfaVerifySchema } from "@/lib/validation/auth";
import { logAuthEvent } from "@/lib/audit";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }

  const parsed = mfaVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Enter the 6-digit code." }, { status: 400 });
  }
  const { factorId, code } = parsed.data;
  const ip = getRequestIp(request);

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const isFirstTimeEnrolment = (factorsData?.all ?? []).find((f) => f.id === factorId)?.status === "unverified";

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });

  if (error) {
    await logAuthEvent({
      email: user.email,
      userId: user.id,
      eventType: "mfa_challenge_failure",
      ipAddress: ip,
      detail: error.message,
    });
    return NextResponse.json({ status: "error", message: "Incorrect code. Try again." }, { status: 401 });
  }

  await logAuthEvent({
    email: user.email,
    userId: user.id,
    eventType: isFirstTimeEnrolment ? "mfa_enrolled" : "mfa_challenge_success",
    ipAddress: ip,
  });

  return NextResponse.json({ status: "ok" });
}
