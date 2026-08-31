import { describe, it, expect } from "vitest";
import { GYM_NAMES } from "@/lib/data/types";
import { generateMissingDigests, getLatestDigest } from "@/lib/assist/digest";
import { getDefaultReportMonth } from "@/lib/data/dashboard";
import { ASSIST_FALLBACK_EMPTY_ANSWER, ASSIST_FALLBACK_TOO_MANY_STEPS } from "@/lib/assist/agent";

// Real Anthropic API calls + real writes to assist_digests — see
// assist.eval.ts's header for why this is excluded from `npm test`.
// Safe to re-run: idempotent by (gym, report_month), so a second run this
// month just confirms every gym already has one rather than regenerating.
const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasApiKey)("Pod Assist — digest generation", () => {
  it(
    "generates (or confirms existing) digests for every gym, and none of them are a silent failure fallback",
    async () => {
      const results = await generateMissingDigests();
      expect(results).toHaveLength(GYM_NAMES.length);
      expect(new Set(results.map((r) => r.gym))).toEqual(new Set(GYM_NAMES));

      const month = getDefaultReportMonth();

      // Checks every gym, not just one — the 2026-08-31 max_tokens bug only
      // hit gyms with heavy enough data to need multi-tool synthesis
      // (Aylesbury, Crewe), not the ones with thin data (Hove). A
      // length-only check on a single gym would not reliably have caught
      // it; exact-matching the known fallback strings on every gym would
      // have.
      for (const gym of GYM_NAMES) {
        const digest = await getLatestDigest(gym);
        expect(digest, `${gym} should have a digest`).not.toBeNull();
        expect(digest?.reportMonth).toBe(month);
        expect(digest?.summary, `${gym}'s digest should not be the empty-answer fallback`).not.toBe(
          ASSIST_FALLBACK_EMPTY_ANSWER
        );
        expect(digest?.summary, `${gym}'s digest should not be the too-many-steps fallback`).not.toBe(
          ASSIST_FALLBACK_TOO_MANY_STEPS
        );
        // A real digest is always multiple sentences — well above either
        // fallback string's own length, so this also catches a fallback by
        // shape even if its exact wording ever changes.
        expect(
          digest?.summary.length ?? 0,
          `${gym}'s digest looks too short to be a real multi-point digest`
        ).toBeGreaterThan(150);
      }
    },
    480000
  );
});
