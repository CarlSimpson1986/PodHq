"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AssistChat } from "@/components/assist/assist-chat";

const DEFAULT_QUESTIONS = [
  "How's revenue this month?",
  "Who's at risk of leaving?",
  "Why did revenue change this month?",
  "How's marketing performing?",
];

// Route-specific defaults shown when the widget is opened fresh on that
// screen — a lightweight form of "context awareness" without needing the
// backend to know what page the question came from (it doesn't; the
// question text itself is all /api/assist ever sees).
const ROUTE_QUESTIONS: { prefix: string; questions: string[] }[] = [
  {
    prefix: "/revenue",
    questions: ["How's revenue this month?", "Why did revenue change this month?", "Who are my top customers?"],
  },
  {
    prefix: "/members",
    questions: ["Who's at risk of leaving?", "Who are my top customers?", "How engaged are my members?"],
  },
  { prefix: "/outgoings", questions: ["How's my P&L looking this month?"] },
  { prefix: "/marketing", questions: ["How's marketing performing?"] },
  { prefix: "/dashboard", questions: DEFAULT_QUESTIONS },
];

function suggestionsForPath(pathname: string | null): string[] {
  if (!pathname) return DEFAULT_QUESTIONS;
  const match = ROUTE_QUESTIONS.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return match?.questions ?? DEFAULT_QUESTIONS;
}

interface AssistWidgetProps {
  role: "admin" | "owner";
}

export function AssistWidget({ role }: AssistWidgetProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div className="fixed bottom-40 right-4 z-50 flex h-[70vh] max-h-[32rem] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-card-border bg-card shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)] md:bottom-24 md:right-6">
          <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Pod Assist</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Pod Assist"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AssistChat role={role} suggestedQuestions={suggestionsForPath(pathname)} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Pod Assist" : "Open Pod Assist"}
        className="fixed bottom-20 right-4 z-50 h-14 w-14 overflow-hidden rounded-full border border-card-border shadow-[0_12px_32px_-8px_rgba(0,0,0,0.8)] transition-transform hover:scale-105 md:bottom-6 md:right-6"
      >
        <img src="/pod-assist-icon.png" alt="Pod Assist" className="h-full w-full object-cover" />
      </button>
    </>
  );
}
