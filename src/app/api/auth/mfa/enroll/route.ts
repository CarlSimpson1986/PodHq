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

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `PodHQ ${new Date().toISOString().slice(0, 10)}`,
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
