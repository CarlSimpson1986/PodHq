import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addToAccessGroup, getSystemToken, removeFromAccessGroup } from "@/lib/pdk";

// Vercel Cron, every 5 minutes (vercel.json). Takes members back out of a
// PDK access group once their booking's unlock window has ended, at gyms
// where our app owns the group (gym_pdk_mapping.app_manages_access_group —
// Hove; see 0107). Same CRON_SECRET bearer check as the other crons.
export const maxDuration = 60;

interface Grant {
  id: number;
  system_id: string;
  holder_id: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: due, error } = await admin
    .from("pdk_access_grants")
    .select("id, system_id, holder_id")
    .is("removed_at", null)
    .lt("expires_at", new Date().toISOString())
    .limit(200);
  if (error) {
    console.error("[api/pdk/expire-access]", { error: error.message });
    return NextResponse.json({ status: "error", message: "Could not load grants." }, { status: 500 });
  }

  let removed = 0;
  const failures: { id: number; error: string }[] = [];

  for (const grant of (due ?? []) as Grant[]) {
    // Claimed only if still expired — an unlock may have extended it since
    // the select above.
    const { data: claimed } = await admin
      .from("pdk_access_grants")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", grant.id)
      .is("removed_at", null)
      .lt("expires_at", new Date().toISOString())
      .select("id");
    if (!claimed?.length) continue;

    try {
      const token = await getSystemToken(grant.system_id);
      await removeFromAccessGroup(grant.system_id, token, grant.holder_id);
      // An unlock for a new booking between the claim and the removal opens
      // a fresh grant — put them back so that booking still works.
      const { data: reopened } = await admin
        .from("pdk_access_grants")
        .select("id")
        .eq("system_id", grant.system_id)
        .eq("holder_id", grant.holder_id)
        .is("removed_at", null)
        .limit(1);
      if (reopened?.length) {
        await addToAccessGroup(grant.system_id, token, grant.holder_id);
      }
      removed++;
    } catch (err) {
      // Released so the next run retries. Fails only if a newer open grant
      // already exists for this holder (unique index) — that one's
      // removal then covers it.
      await admin.from("pdk_access_grants").update({ removed_at: null }).eq("id", grant.id);
      failures.push({ id: grant.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (failures.length > 0) {
    console.error("[api/pdk/expire-access]", { failures });
  }
  return NextResponse.json(
    { status: failures.length ? "partial" : "ok", removed, failed: failures.length },
    { status: failures.length ? 500 : 200 }
  );
}
