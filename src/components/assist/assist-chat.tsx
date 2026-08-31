"use client";

import { useRef, useState } from "react";
import { GymSelect } from "@/components/ui/gym-select";
import type { GymName } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

interface AssistTurn {
  id: number;
  question: string;
  status: "loading" | "done" | "error";
  answer?: string;
  toolNames?: string[];
  errorMessage?: string;
}

interface AssistChatProps {
  role: "admin" | "owner";
  suggestedQuestions: string[];
}

export function AssistChat({ role, suggestedQuestions }: AssistChatProps) {
  const [gymFilter, setGymFilter] = useState<GymName | null>(null);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<AssistTurn[]>([]);
  const nextId = useRef(0);

  const sending = turns.some((t) => t.status === "loading");

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    const id = nextId.current++;
    setTurns((prev) => [...prev, { id, question: trimmed, status: "loading" }]);
    setInput("");

    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, ...(role === "admin" && gymFilter ? { gym: gymFilter } : {}) }),
      });
      const body = await res.json();

      if (body.status !== "ok") {
        setTurns((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: "error", errorMessage: body.message ?? "That didn't work." } : t))
        );
        return;
      }

      const toolNames = [...new Set((body.toolCalls ?? []).map((c: { name: string }) => c.name))] as string[];
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, status: "done", answer: body.answer, toolNames } : t)));
    } catch {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "error", errorMessage: "Something went wrong. Try again." } : t))
      );
    }
  }

  return (
    <div className="flex h-full flex-col">
      {role === "admin" && (
        <div className="flex items-center gap-2 border-b border-card-border px-4 py-3">
          <span className="text-xs text-muted-foreground">Gym:</span>
          <GymSelect value={gymFilter} onChange={setGymFilter} className="w-40" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <div>
            <p className="text-sm text-muted-foreground">
              Ask a question grounded in your own data — Pod Assist only ever answers from real numbers, never a guess.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  className="rounded-md border border-card-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-background"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.length > 0 && (
          <div className="flex flex-col gap-4">
            {turns.map((turn) => (
              <div key={turn.id}>
                <p className="text-sm font-semibold text-foreground">{turn.question}</p>
                {turn.status === "loading" && <p className="mt-1 text-sm text-muted-foreground">Thinking…</p>}
                {turn.status === "error" && <p className="mt-1 text-sm text-danger">{turn.errorMessage}</p>}
                {turn.status === "done" && (
                  <>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{turn.answer}</p>
                    {turn.toolNames && turn.toolNames.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground/70">Checked: {turn.toolNames.join(", ")}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-card-border p-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about revenue, members, marketing, or P&L…"
          disabled={sending}
          maxLength={500}
          className="flex-1 rounded-md border border-card-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50"
        />
        <button type="submit" disabled={sending || !input.trim()} className={buttonClass}>
          {sending ? "Asking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
