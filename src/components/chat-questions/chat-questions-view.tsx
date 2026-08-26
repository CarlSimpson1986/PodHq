"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatQuestion } from "@/lib/data/help-chat-questions";
import type { FaqItem } from "@/lib/data/help-faq";
import type { GymName } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass = "w-full rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ChatQuestionsView({
  role,
  gym,
  initialQuestions,
  faqItems,
}: {
  role: "admin" | "owner";
  gym: GymName | null;
  initialQuestions: ChatQuestion[];
  faqItems: FaqItem[];
}) {
  const [questions, setQuestions] = useState<ChatQuestion[]>(initialQuestions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = gym ? `?gym=${encodeURIComponent(gym)}` : "";
      const res = await fetch(`/api/chat-questions${params}`);
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not load chat questions.");
        return;
      }
      setQuestions(body.questions);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }, [gym]);

  useEffect(() => {
    // Owner never changes gym (no selector), so their server-provided
    // initialQuestions is always current — only admin's GymSelect changes
    // need a refetch. Deferred a tick, same pattern as promo-codes-view.
    if (role === "admin") queueMicrotask(load);
  }, [role, load]);

  async function handleResolve(id: number, addToFaq: boolean) {
    setBusyId(id);
    setError("");
    try {
      const nextDisplayOrder = faqItems.length > 0 ? Math.max(...faqItems.map((f) => f.displayOrder)) + 1 : 0;
      const res = await fetch(`/api/chat-questions/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(gym ? { gym } : {}),
          ...(addToFaq ? { addToFaq: { answer: answer.trim(), displayOrder: nextDisplayOrder } } : {}),
        }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not resolve this question.");
        return;
      }
      setQuestions((qs) => qs.filter((q) => q.id !== id));
      setPublishingId(null);
      setAnswer("");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card-glass p-4">
      <h2 className="text-sm font-semibold text-foreground">Unanswered questions</h2>
      {loading && <p className="mt-2 text-xs text-muted-foreground">Loading...</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {questions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing outstanding — every question POD has been asked recently, it could answer.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {questions.map((q) => (
            <li key={q.id} className="rounded-md border border-card-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground">&quot;{q.question}&quot;</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {q.memberName} &middot; {q.gym} &middot; {timeAgo(q.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => handleResolve(q.id, false)} disabled={busyId === q.id} className={secondaryButtonClass}>
                    {busyId === q.id && publishingId !== q.id ? "Working..." : "Mark resolved"}
                  </button>
                  {role === "admin" && publishingId !== q.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setPublishingId(q.id);
                        setAnswer("");
                      }}
                      className={buttonClass}
                    >
                      Answer &amp; add to FAQ
                    </button>
                  )}
                </div>
              </div>

              {publishingId === q.id && (
                <div className="mt-3 space-y-2 border-t border-card-border pt-3">
                  <textarea
                    placeholder="The answer to publish for every gym's members..."
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={3}
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolve(q.id, true)}
                      disabled={busyId === q.id || !answer.trim()}
                      className={buttonClass}
                    >
                      {busyId === q.id ? "Publishing..." : "Publish & resolve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPublishingId(null);
                        setAnswer("");
                      }}
                      className={secondaryButtonClass}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
