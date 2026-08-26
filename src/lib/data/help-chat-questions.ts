import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";

// The review queue for questions podhq-client's "POD" help chat couldn't
// answer — logged there via a service-role write (this app's DB, cross-app
// access, same pattern staff-recipients.ts already uses). See
// 0063_help_faq_and_chat_questions.sql.
export interface ChatQuestion {
  id: number;
  memberId: number;
  memberName: string;
  gym: string;
  question: string;
  resolvedAt: string | null;
  faqItemId: number | null;
  createdAt: string;
}

/** gym: null means every gym (admin, no gym selected) — owners always pass their own. */
export async function listChatQuestions(gym: GymName | null, includeResolved: boolean): Promise<ChatQuestion[]> {
  const admin = createAdminClient();
  let query = admin
    .from("help_chat_unanswered_questions")
    .select("id, member_id, gym, question, resolved_at, faq_item_id, created_at, members(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (gym) query = query.eq("gym", gym);
  if (!includeResolved) query = query.is("resolved_at", null);

  const { data, error } = await query.returns<
    {
      id: number;
      member_id: number;
      gym: string;
      question: string;
      resolved_at: string | null;
      faq_item_id: number | null;
      created_at: string;
      members: { name: string } | null;
    }[]
  >();
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.members?.name ?? "Unknown member",
    gym: row.gym,
    question: row.question,
    resolvedAt: row.resolved_at,
    faqItemId: row.faq_item_id,
    createdAt: row.created_at,
  }));
}

export type ResolveChatQuestionResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

/** gym: null means admin (no gym restriction); an owner always passes their own, checked alongside id so they can never resolve another gym's row by guessing its id. */
export async function resolveChatQuestion(
  id: number,
  gym: GymName | null,
  resolvedBy: string,
  faqItemId: number | null
): Promise<ResolveChatQuestionResult> {
  const admin = createAdminClient();
  let query = admin
    .from("help_chat_unanswered_questions")
    .update({ resolved_at: new Date().toISOString(), resolved_by: resolvedBy, faq_item_id: faqItemId })
    .eq("id", id);

  if (gym) query = query.eq("gym", gym);

  const { data, error } = await query.select("id").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}
