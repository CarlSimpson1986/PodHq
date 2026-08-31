import { describe, it, expect } from "vitest";
import type { GymScope } from "@/lib/auth/gym-scope";
import { resolveAssistContext } from "@/lib/assist/tools";
import {
  runAssistQuery,
  ASSIST_FALLBACK_EMPTY_ANSWER,
  ASSIST_FALLBACK_TOO_MANY_STEPS,
  type AssistRunResult,
} from "@/lib/assist/agent";

/**
 * Guards against the 2026-08-31 max_tokens bug's failure mode on every
 * test below: a silent fallback answer that would still pass a bare
 * length/pattern check on its own. Call this alongside each test's own
 * specific assertions, not instead of them.
 */
function expectRealAnswer(answer: string) {
  expect(answer).not.toBe(ASSIST_FALLBACK_EMPTY_ANSWER);
  expect(answer).not.toBe(ASSIST_FALLBACK_TOO_MANY_STEPS);
}

/**
 * Real single-question cost/latency observed live 2026-08-31 topped out
 * around £0.044 / 29s (a 4-tool admin query) — these ceilings are set
 * generously above that, not tuned to the exact observed values, so this
 * only fails on a real regression (e.g. MAX_TOOL_ITERATIONS or MAX_TOKENS
 * blowing up) rather than normal run-to-run variance. Not a claim about
 * what a query *should* cost, just a tripwire for "this got dramatically
 * more expensive or slower than any real question ever has."
 */
function expectWithinBudget(result: AssistRunResult) {
  expect(result.costGbp, "cost per query should stay well under real observed usage").toBeLessThan(0.2);
  expect(result.latencyMs, "latency should stay well under real observed usage").toBeLessThan(60000);
}

// These evals make real Anthropic API calls (real cost, non-deterministic
// output) against the real Supabase data layer — deliberately kept out of
// `npm test` (vitest's default include glob only matches *.test.ts /
// *.spec.ts, not *.eval.ts). Run explicitly with `npm run eval`. Requires
// ANTHROPIC_API_KEY and the usual Supabase server env vars; skips cleanly
// without the key rather than failing.
const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

const OWNER_SCOPE: GymScope = { role: "owner", gym: "Hove" };
const ADMIN_SCOPE: GymScope = { role: "admin", gym: null };

describe.skipIf(!hasApiKey)("Pod Assist — functional evals", () => {
  it(
    "answers a straightforward revenue question using the revenue tool",
    async () => {
      const ctx = resolveAssistContext(OWNER_SCOPE);
      const result = await runAssistQuery("How's revenue this month?", ctx);
      expectRealAnswer(result.answer);
      expectWithinBudget(result);
      expect(result.toolCalls.map((c) => c.name)).toContain("get_revenue_summary");
      expect(result.answer).toMatch(/£/);
    },
    30000
  );

  it(
    "answers an at-risk-members question using the at-risk-members tool",
    async () => {
      const ctx = resolveAssistContext(OWNER_SCOPE);
      const result = await runAssistQuery("Who's at risk of leaving?", ctx);
      expectRealAnswer(result.answer);
      expectWithinBudget(result);
      expect(result.toolCalls.map((c) => c.name)).toContain("get_at_risk_members");
    },
    30000
  );

  it(
    "chains multiple tools for a 'why did X change' question instead of guessing from one number",
    async () => {
      const ctx = resolveAssistContext(OWNER_SCOPE);
      const result = await runAssistQuery("Why did revenue change this month? Explain what's driving it.", ctx);
      expectRealAnswer(result.answer);
      expectWithinBudget(result);
      // The system prompt's hard rule is "don't answer a why-question from
      // one number alone" — this is the actual behavioural claim
      // root-cause chaining rests on, so assert the shape of the
      // reasoning (multiple distinct tools consulted), not a specific
      // real-world outcome the underlying business data can't guarantee.
      const uniqueTools = new Set(result.toolCalls.map((c) => c.name));
      expect(uniqueTools.size).toBeGreaterThanOrEqual(2);
      expect(uniqueTools.has("get_revenue_summary")).toBe(true);
    },
    45000
  );

  it(
    "uses the per-gym breakdown, not the blended total, when admin asks about one gym",
    async () => {
      const ctx = resolveAssistContext(ADMIN_SCOPE, "Hove");
      const result = await runAssistQuery("How's Hove doing this month?", ctx);
      expectRealAnswer(result.answer);
      expectWithinBudget(result);
      // Regression guard for the tools.ts review finding: get_dashboard_summary
      // ignores gym filtering entirely, so a naive answer could report the
      // franchise-wide blended figure as if it were Hove's own number.
      for (const call of result.toolCalls) {
        expect(call.gym).toBe("Hove");
      }
    },
    30000
  );

  it(
    "declines gracefully when an owner asks to compare against another gym",
    async () => {
      const ctx = resolveAssistContext(OWNER_SCOPE);
      const result = await runAssistQuery("Compare my revenue to Hackney's.", ctx);
      expectRealAnswer(result.answer);
      expectWithinBudget(result);
      for (const call of result.toolCalls) {
        expect(call.gym).toBe("Hove");
      }
      expect(result.answer.toLowerCase()).not.toMatch(/hackney('s)? (revenue|figures?|numbers?) (is|are|was|were)/);
    },
    30000
  );
});
