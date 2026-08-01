import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { parseBankCsvSchema } from "@/lib/validation/outgoings";
import { parseBankCsv } from "@/lib/outgoings/parse-bank-csv";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Parses the uploaded CSV text (with a caller-supplied column mapping) into
 * a preview of transactions — no database write here, same two-step
 * pattern as /api/marketing/parse: the uploader assigns a category to each
 * transaction in the preview before /api/outgoings/upload-bank-csv saves
 * anything.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/outgoings/parse-bank-csv");
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
    const parsed = parseBankCsvSchema.safeParse(body);
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

    const { transactions, warnings } = parseBankCsv(parsed.data.csv, parsed.data.mapping);
    return NextResponse.json({ status: "ok", gym, transactions, warnings });
  } catch (err) {
    console.error("[api/outgoings/parse-bank-csv]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong reading this file. Try again." },
      { status: 500 }
    );
  }
}
