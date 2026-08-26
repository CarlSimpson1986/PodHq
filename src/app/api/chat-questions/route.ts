import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { resolveGym } from "@/lib/auth/resolve-gym";
import { listChatQuestions } from "@/lib/data/help-chat-questions";
import { checkRateLimit } from "@/lib/rate-limit";

// Same fallback-access pattern as Setup/pricing: owner always sees their
// own gym, admin picks one via ?gym= or gets every gym's queue with none
// selected (unlike Setup, "no gym selected" is a real answer here rather
// than an empty state — admin's overview across all 9 gyms is the point).
export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/chat-questions");
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

    const gymParam = request.nextUrl.searchParams.get("gym");
    const gym = resolveGym(scope, gymParam);
    const includeResolved = request.nextUrl.searchParams.get("includeResolved") === "true";

    const questions = await listChatQuestions(gym, includeResolved);
    return NextResponse.json({ status: "ok", gym, questions });
  } catch (err) {
    console.error("[api/chat-questions GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load chat questions." }, { status: 500 });
  }
}
