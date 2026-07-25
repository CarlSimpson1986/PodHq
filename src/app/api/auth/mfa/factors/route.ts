import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    return NextResponse.json({ status: "error", message: "Could not load MFA factors." }, { status: 400 });
  }

  return NextResponse.json({
    status: "ok",
    factors: data.totp.map((f) => ({ id: f.id, friendlyName: f.friendly_name })),
  });
}
