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

  // Clean up any stale unverified factor before starting a new one — a page
  // refresh or a retry after an error otherwise calls enroll() a second
  // time and collides with whatever the first attempt left behind. A user
  // only ever reaches this route with zero verified factors (see
  // resolveNextAuthStep/updateSession), so anything found here is always
  // safe to discard — never a real, in-use second factor.
  const { data: existing } = await supabase.auth.mfa.listFactors();
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
