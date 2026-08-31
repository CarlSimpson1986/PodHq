import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listChatQuestions } from "@/lib/data/help-chat-questions";
import { listFaqItems } from "@/lib/data/help-faq";
import { ChatQuestionsShell } from "@/components/chat-questions/chat-questions-shell";

// Continuous-improvement loop for podhq-client's "POD" help chat: every
// question the bot couldn't answer lands here. Same fallback-access
// pattern as Setup/pricing (owner: always their own gym; admin: picks
// one via GymSelect, or sees every gym's queue with none selected) — but
// the FAQ half below is admin-only, same reasoning as Brevo config: one
// answer here changes what every gym's members hear.
export default async function ChatQuestionsPage() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-danger">Not signed in.</p>
      </main>
    );
  }

  const scope = await getGymScope(user.id);
  if (!scope) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">No gym or role is assigned to this account. Contact your admin.</p>
      </main>
    );
  }

  const gym = scope.role === "owner" ? scope.gym : null;
  const [questions, faqItems] = await Promise.all([
    listChatQuestions(gym, false),
    scope.role === "admin" ? listFaqItems() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <ChatQuestionsShell role={scope.role} initialGym={gym} initialQuestions={questions} initialFaqItems={faqItems} />
    </div>
  );
}
