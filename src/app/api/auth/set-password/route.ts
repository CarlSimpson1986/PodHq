import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setPasswordSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }

  const parsed = setPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid password." },
      { status: 400 }
    );
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return NextResponse.json({ status: "error", message: "Could not set password." }, { status: 400 });
  }

  // Only relevant for admin-created owner accounts (see createOwnerAccount)
  // but harmless to clear unconditionally for every other path that lands
  // here (invite/recovery) — those accounts never had the flag set.
  if (user.app_metadata?.must_change_password) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { must_change_password: false },
    });
  }

  return NextResponse.json({ status: "ok" });
}
