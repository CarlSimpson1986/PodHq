import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { parseAdSpendSchema } from "@/lib/validation/marketing";
import { parseMetaCsv, parseLeadsCsv, mergeWeeklyDrafts } from "@/lib/marketing/parse";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Parses the uploaded CSV text into a preview of weekly rows — no database
 * write here. Saving is a separate confirm step (/api/marketing/upload) so
 * the uploader can see what a re-upload is about to overwrite before it
 * happens.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/marketing/parse");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json(
        { status: "error", message: "No gym or role is assigned to this account." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = parseAdSpendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    // Security: an owner can only ever parse/upload for their own gym,
    // regardless of what a client sends — same pattern as /api/outgoings.
    let gym;
    if (scope.role === "owner") {
      gym = scope.gym;
    } else {
      if (!parsed.data.gym) {
        return NextResponse.json({ status: "error", message: "A gym must be selected." }, { status: 400 });
      }
      gym = parsed.data.gym;
    }

    const metaResult = parsed.data.metaCsv ? parseMetaCsv(parsed.data.metaCsv) : { weeks: [], warnings: [] };
    const leadsResult = parsed.data.leadsCsv ? parseLeadsCsv(parsed.data.leadsCsv) : { weeks: [], warnings: [] };
    const weeks = mergeWeeklyDrafts(metaResult.weeks, leadsResult.weeks);
    const warnings = [...metaResult.warnings, ...leadsResult.warnings];

    return NextResponse.json({ status: "ok", gym, weeks, warnings });
  } catch (err) {
    console.error("[api/marketing/parse]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong reading these files. Try again." },
      { status: 500 }
    );
  }
}
