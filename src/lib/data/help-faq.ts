import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Franchisor-level FAQ for podhq-client's "POD" help chat
// (src/lib/help-bot.ts there) — one answer here changes what the bot
// tells members at every gym, so this is admin-only to edit (see
// /api/help-faq), unlike the gym-scoped help_chat_unanswered_questions
// queue it's fed from. See 0063_help_faq_and_chat_questions.sql.
export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  displayOrder: number;
  updatedAt: string;
}

export async function listFaqItems(): Promise<FaqItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("help_faq_items")
    .select("id, question, answer, display_order, updated_at")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    displayOrder: row.display_order,
    updatedAt: row.updated_at,
  }));
}

export type CreateFaqItemResult = { status: "ok"; item: FaqItem } | { status: "error"; message: string };

export async function createFaqItem(input: {
  question: string;
  answer: string;
  displayOrder: number;
  createdBy: string;
}): Promise<CreateFaqItemResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("help_faq_items")
    .insert({
      question: input.question,
      answer: input.answer,
      display_order: input.displayOrder,
      created_by: input.createdBy,
    })
    .select("id, question, answer, display_order, updated_at")
    .single();

  if (error) return { status: "error", message: error.message };
  return {
    status: "ok",
    item: {
      id: data.id,
      question: data.question,
      answer: data.answer,
      displayOrder: data.display_order,
      updatedAt: data.updated_at,
    },
  };
}

export type UpdateFaqItemResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

export async function updateFaqItem(
  id: number,
  input: { question: string; answer: string; displayOrder: number }
): Promise<UpdateFaqItemResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("help_faq_items")
    .update({
      question: input.question,
      answer: input.answer,
      display_order: input.displayOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}

export type DeleteFaqItemResult = { status: "ok" } | { status: "not_found" } | { status: "error"; message: string };

export async function deleteFaqItem(id: number): Promise<DeleteFaqItemResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("help_faq_items").delete().eq("id", id).select("id").maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "not_found" };
  return { status: "ok" };
}
