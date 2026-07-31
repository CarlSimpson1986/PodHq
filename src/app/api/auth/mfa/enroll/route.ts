import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  // /api/auth/* is deliberately reachable at any AAL (see middleware), so an
  // AAL1-only session could otherwise reach this route directly and enroll
  // a second, attacker-controlled factor on an account that already has a
  // verified one — reject that outright rather than relying on the page
  // flow to keep users away from here.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  if (existing?.all.some((f) => f.status === "verified")) {
    return NextResponse.json(
      { status: "error", message: "MFA is already set up on this account." },
      { status: 400 }
    );
  }

  // Clean up any stale unverified factor before starting a new one — a page
  // refresh or a retry after an error otherwise calls enroll() a second
  // time and collides with whatever the first attempt left behind.
  for (const factor of existing?.all.filter((f) => f.status === "unverified") ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    // Full timestamp, not just the date — belt-and-braces against any
    // remaining friendly_name collision even after the cleanup above.
    friendlyName: `PodHQ ${new Date().toISOString()}`,
  });

  if (error || !data) {
    return NextResponse.json(
      { status: "error", message: "Could not start MFA enrolment." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    status: "ok",
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  });
}
