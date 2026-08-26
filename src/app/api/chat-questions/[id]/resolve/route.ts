import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGymScope } from "@/lib/auth/gym-scope";
import { resolveGym } from "@/lib/auth/resolve-gym";
import { resolveChatQuestion } from "@/lib/data/help-chat-questions";
import { createFaqItem } from "@/lib/data/help-faq";
import { resolveChatQuestionSchema } from "@/lib/validation/help-chat-questions";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/chat-questions/[id]/resolve");
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

    const { id } = await params;
    const questionId = Number(id);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return NextResponse.json({ status: "error", message: "Invalid question." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = resolveChatQuestionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    // Marking resolved is available to whichever gym's own owner it
    // belongs to (or admin, any gym) — but publishing the answer to the
    // FAQ affects every gym's members, so that half is admin-only, same
    // as /api/help-faq's own POST.
    if (parsed.data.addToFaq && scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Only admins can publish an answer to the FAQ." }, { status: 403 });
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (scope.role === "owner" && !gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    let faqItemId: number | null = null;
    if (parsed.data.addToFaq) {
      const question = await questionText(questionId);
      if (!question) {
        return NextResponse.json({ status: "error", message: "Question not found." }, { status: 404 });
      }
      const faqResult = await createFaqItem({
        question,
        answer: parsed.data.addToFaq.answer,
        displayOrder: parsed.data.addToFaq.displayOrder,
        createdBy: user.id,
      });
      if (faqResult.status === "error") {
        console.error("[api/chat-questions/[id]/resolve]", { userId: user.id, error: faqResult.message });
        return NextResponse.json({ status: "error", message: "Could not publish this answer to the FAQ." }, { status: 500 });
      }
      faqItemId = faqResult.item.id;
    }

    // Admin resolving without a gym filter (viewing "every gym") passes
    // null through resolveGym — resolveChatQuestion treats that as "no
    // gym restriction", matching an admin's actual authority.
    const result = await resolveChatQuestion(questionId, gym, user.id, faqItemId);
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Question not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/chat-questions/[id]/resolve]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not resolve this question." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", faqItemId });
  } catch (err) {
    console.error("[api/chat-questions/[id]/resolve]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}

async function questionText(id: number): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("help_chat_unanswered_questions").select("question").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data.question as string;
}
