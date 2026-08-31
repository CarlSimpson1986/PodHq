import { describe, it } from "vitest";
import { runAssistQuery } from "@/lib/assist/agent";
import { resolveAssistContext } from "@/lib/assist/tools";
import type { GymScope } from "@/lib/auth/gym-scope";

// A repeatable stand-in for "someone reads a sample of real output and
// judges whether it's actually good" — the one dimension the pass/fail
// eval suite (assist.eval.ts, assist-security.eval.ts, assist-digest.eval.ts)
// deliberately can't check: whether the business insight itself is smart,
// not just grounded/scoped/non-empty. No assertions here on purpose —
// this can't fail, it's not trying to. Run it, then a human reads the
// printed output. Not part of `npm run eval` (see vitest.quality-review.config.ts's
// header for why) — run explicitly with `npm run quality-review`.
//
// Extend this list over time rather than replacing it — a growing set of
// real questions read by a human periodically is the point, not a fixed
// one-off checklist.
const SAMPLE: { label: string; question: string; scope: GymScope; requestedGym?: string }[] = [
  {
    label: "Crewe — root-cause chaining on a real revenue question",
    question: "Why did revenue change this month?",
    scope: { role: "owner", gym: "Crewe" },
  },
  {
    label: "Basingstoke — single-tool, straightforward",
    question: "How's revenue this month?",
    scope: { role: "owner", gym: "Basingstoke" },
  },
  {
    label: "Oxford East — playbook + own-data combined",
    question: "What should I do to improve marketing?",
    scope: { role: "owner", gym: "Oxford East" },
  },
  {
    label: "Admin, all gyms — cross-gym engagement question",
    question: "Who's at risk of leaving?",
    scope: { role: "admin", gym: null },
  },
];

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("Pod Assist — quality spot-check (read the output, don't just check it passed)", () => {
  for (const { label, question, scope, requestedGym } of SAMPLE) {
    it(`prints a real answer for manual review: ${label}`, async () => {
      const ctx = resolveAssistContext(scope, requestedGym);
      const result = await runAssistQuery(question, ctx);
      console.log(`\n${"=".repeat(70)}\n${label}\nQ: ${question}\n${"-".repeat(70)}`);
      console.log(result.answer);
      console.log(
        `\n[tools: ${[...new Set(result.toolCalls.map((c) => c.name))].join(", ")}] [tokensOut: ${result.tokensOut}] [£${result.costGbp.toFixed(4)}] [${result.latencyMs}ms]`
      );
    });
  }
});
