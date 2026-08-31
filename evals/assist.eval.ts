import { describe, it, expect } from "vitest";
import type { GymScope } from "@/lib/auth/gym-scope";
import { resolveAssistContext } from "@/lib/assist/tools";
import { runAssistQuery } from "@/lib/assist/agent";

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
      expect(result.toolCalls.map((c) => c.name)).toContain("get_at_risk_members");
    },
    30000
  );

  it(
    "chains multiple tools for a 'why did X change' question instead of guessing from one number",
    async () => {
      const ctx = resolveAssistContext(OWNER_SCOPE);
      const result = await runAssistQuery("Why did revenue change this month? Explain what's driving it.", ctx);
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
      for (const call of result.toolCalls) {
        expect(call.gym).toBe("Hove");
      }
      expect(result.answer.toLowerCase()).not.toMatch(/hackney('s)? (revenue|figures?|numbers?) (is|are|was|were)/);
    },
    30000
  );
});
