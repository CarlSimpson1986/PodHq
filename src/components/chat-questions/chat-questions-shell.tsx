"use client";

import { useState } from "react";
import type { ChatQuestion } from "@/lib/data/help-chat-questions";
import type { FaqItem } from "@/lib/data/help-faq";
import type { GymName } from "@/lib/data/types";
import { GymSelect } from "@/components/ui/gym-select";
import { ChatQuestionsView } from "@/components/chat-questions/chat-questions-view";
import { HelpFaqView } from "@/components/chat-questions/help-faq-view";

// Same shared-gym-selector pattern as Setup (setup-shell.tsx) — one
// GymSelect scopes the queue below it for admin; an owner's gym is fixed
// (see page.tsx, no selector at all). The FAQ manager underneath is
// always global (no gym scoping) — see help-faq-view.tsx.
export function ChatQuestionsShell({
  role,
  initialGym,
  initialQuestions,
  initialFaqItems,
}: {
  role: "admin" | "owner";
  initialGym: GymName | null;
  initialQuestions: ChatQuestion[];
  initialFaqItems: FaqItem[];
}) {
  const [gym, setGym] = useState<GymName | null>(initialGym);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Chat Questions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Questions members asked the POD help chat that it couldn&apos;t answer from the FAQ or Ts &amp; Cs.
        </p>
      </div>

      {role === "admin" && (
        <div>
          <p className="text-sm text-muted-foreground">One gym at a time, or leave as &quot;All gyms&quot; for the full queue.</p>
          <div className="mt-2">
            <GymSelect value={gym} onChange={setGym} />
          </div>
        </div>
      )}

      <ChatQuestionsView role={role} gym={gym} initialQuestions={gym === initialGym ? initialQuestions : []} faqItems={initialFaqItems} />

      {role === "admin" && <HelpFaqView initialItems={initialFaqItems} />}
    </div>
  );
}
