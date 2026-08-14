import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getRecentTransactions } from "@/lib/data/refunds";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { transactionsQuerySchema } from "@/lib/validation/refunds";
import { checkRateLimit } from "@/lib/rate-limit";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

function resolveGym(
  scope: { role: "admin"; gym: null } | { role: "owner"; gym: GymName },
  gymParam: string | null | undefined
): GymName | null {
  if (scope.role === "owner") return scope.gym;
  if (!gymParam || !isGymName(gymParam)) return null;
  return gymParam;
}

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/pods/transactions");
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

    const parsed = transactionsQuerySchema.safeParse({ gym: request.nextUrl.searchParams.get("gym") ?? undefined });
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (!gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    const transactions = await getRecentTransactions(gym);
    return NextResponse.json({ status: "ok", transactions });
  } catch (err) {
    console.error("[api/pods/transactions GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
