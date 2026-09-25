import { NextResponse, type NextRequest } from "next/server";
import { previousMonth, syncDoorHistoryMonth } from "@/lib/door-history";

// Monthly Vercel Cron (vercel.json, 1st of each month) caching the
// previous month's door entries from Kisi and PDK into door_entries —
// see src/lib/door-history.ts. Same CRON_SECRET bearer check as
// /api/assist/digest; no user session exists on a cron call.
//
// `?month=YYYY-MM` re-runs or backfills a specific month (safe to repeat:
// already-stored events are skipped).
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized." }, { status: 401 });
  }

  const requested = request.nextUrl.searchParams.get("month");
  if (requested && !/^\d{4}-(0[1-9]|1[0-2])$/.test(requested)) {
    return NextResponse.json({ status: "error", message: "month must be YYYY-MM." }, { status: 400 });
  }
  const month = requested ?? previousMonth();

  try {
    const results = await syncDoorHistoryMonth(month);
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      console.error("[api/door-history/sync]", { month, failed });
    }
    // 500 when any site failed, so a partial run shows as failed in
    // Vercel's cron log rather than passing silently.
    return NextResponse.json(
      { status: failed.length ? "partial" : "ok", month, results },
      { status: failed.length ? 500 : 200 }
    );
  } catch (err) {
    console.error("[api/door-history/sync]", { month, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Door history sync failed." }, { status: 500 });
  }
}
