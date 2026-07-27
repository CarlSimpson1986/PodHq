import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getCustomerDirectory } from "@/lib/data/members";
import { customerDirectoryQuerySchema } from "@/lib/validation/members";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/members/directory");
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

    const { searchParams } = request.nextUrl;
    const parsed = customerDirectoryQuerySchema.safeParse({
      gym: searchParams.get("gym") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid query parameters." }, { status: 400 });
    }

    // Security: an owner only ever sees their own gym, regardless of what a
    // client sends — only an admin's gym selection is actually honoured.
    const gym = scope.role === "owner" ? scope.gym : (parsed.data.gym ?? null);

    const customers = await getCustomerDirectory(gym);
    return NextResponse.json({ status: "ok", role: scope.role, gym, customers });
  } catch (err) {
    console.error("[api/members/directory]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong loading customer data. Try again." },
      { status: 500 }
    );
  }
}
