import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGymScope } from "@/lib/auth/gym-scope";
import { checkRateLimit } from "@/lib/rate-limit";
import { assistQuerySchema } from "@/lib/validation/assist";
import { resolveAssistContext } from "@/lib/assist/tools";
import { runAssistQuery } from "@/lib/assist/agent";

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  // Tighter than most routes deliberately unnecessary here — checkRateLimit's
  // shared 100/min cap still applies, but each request here is a real LLM
  // call with token cost and up to 6 chained tool calls, not a cheap read.
  const rateLimit = await checkRateLimit(user.id, "/api/assist");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json({ status: "error", message: "No gym assigned to this account." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = assistQuerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const ctx = resolveAssistContext(scope, parsed.data.gym ?? null);
    const result = await runAssistQuery(parsed.data.question, ctx);

    const admin = createAdminClient();
    const { error: logError } = await admin.from("assist_query_log").insert({
      user_id: user.id,
      gym: ctx.effectiveGym,
      role: scope.role,
      question: parsed.data.question,
      tool_calls: result.toolCalls,
      answer: result.answer,
      latency_ms: result.latencyMs,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_gbp: result.costGbp,
    });
    if (logError) {
      console.error("[api/assist] query log insert failed", { userId: user.id, error: logError.message });
    }

    return NextResponse.json({ status: "ok", answer: result.answer, toolCalls: result.toolCalls });
  } catch (err) {
    console.error("[api/assist]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Couldn't process that question. Try again." }, { status: 500 });
  }
}
