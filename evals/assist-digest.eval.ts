import { describe, it, expect } from "vitest";
import { GYM_NAMES } from "@/lib/data/types";
import { generateMissingDigests, getLatestDigest } from "@/lib/assist/digest";
import { getDefaultReportMonth } from "@/lib/data/dashboard";

// Real Anthropic API calls + real writes to assist_digests — see
// assist.eval.ts's header for why this is excluded from `npm test`.
// Safe to re-run: idempotent by (gym, report_month), so a second run this
// month just confirms every gym already has one rather than regenerating.
const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasApiKey)("Pod Assist — digest generation", () => {
  it(
    "generates (or confirms existing) digests for every gym and they're readable back",
    async () => {
      const results = await generateMissingDigests();
      expect(results).toHaveLength(GYM_NAMES.length);
      expect(new Set(results.map((r) => r.gym))).toEqual(new Set(GYM_NAMES));

      const month = getDefaultReportMonth();
      const sample = await getLatestDigest(GYM_NAMES[0]);
      expect(sample).not.toBeNull();
      expect(sample?.reportMonth).toBe(month);
      expect(sample?.summary.length).toBeGreaterThan(0);
    },
    480000
  );
});
