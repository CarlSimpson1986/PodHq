import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { logAuthEvent } from "@/lib/audit";

export async function POST() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  if (user?.email) {
    await logAuthEvent({ email: user.email, userId: user.id, eventType: "logout" });
  }

  return NextResponse.json({ status: "ok" });
}
