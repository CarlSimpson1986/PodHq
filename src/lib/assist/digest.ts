import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { getDefaultReportMonth } from "@/lib/data/dashboard";
import type { GymScope } from "@/lib/auth/gym-scope";
import type { AssistContext } from "./tools";
import { runAssistQuery, type AssistRunResult } from "./agent";

// One canned question per gym, run automatically — the digest is
// deliberately just a scheduled instance of the same root-cause-chaining
// behaviour the live chat already does, not a separate code path with its
// own logic to trust.
const DIGEST_QUESTION =
  "Generate this month's action-points digest. Compare this month to last month using whatever tools you need — check more than one if something looks worth a closer look, the same way you would for a \"why did X change\" question. Then give 3-5 specific, prioritised action points for the owner this week. Every point must be tied to a real number you found this gym this month — skip generic advice that isn't specific to this gym's actual data.";

export interface DigestRow {
  gym: GymName;
  reportMonth: string;
  summary: string;
  toolNames: string[];
  createdAt: string;
}

function digestContextForGym(gym: GymName): AssistContext {
  // Synthetic owner scope for a background job — legitimate here because
  // this only ever selects which gym's data the tools return (the same
  // scoping a real owner of this gym would get), and this path never
  // handles a real user's session.
  const scope: GymScope = { role: "owner", gym };
  return { scope, effectiveGym: gym };
}

async function generateDigestForGym(gym: GymName): Promise<AssistRunResult> {
  return runAssistQuery(DIGEST_QUESTION, digestContextForGym(gym));
}

/**
 * Generates a digest for every gym that doesn't already have one for the
 * current report month, and stores it. Safe to call repeatedly (e.g. a
 * daily cron rather than a precisely-timed monthly one, since we don't
 * know exactly when the pipeline backfill lands each month) — the unique
 * (gym, report_month) constraint plus this existence check make it a
 * no-op for gyms already generated this month.
 */
export async function generateMissingDigests(): Promise<{ gym: GymName; generated: boolean }[]> {
  const reportMonth = getDefaultReportMonth();
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("assist_digests")
    .select("gym")
    .eq("report_month", reportMonth);
  if (existingError) throw new Error(`generateMissingDigests: ${existingError.message}`);

  const alreadyDone = new Set((existing ?? []).map((row) => row.gym as GymName));
  const results: { gym: GymName; generated: boolean }[] = [];

  for (const gym of GYM_NAMES) {
    if (alreadyDone.has(gym)) {
      results.push({ gym, generated: false });
      continue;
    }

    const result = await generateDigestForGym(gym);
    const { error: insertError } = await admin.from("assist_digests").insert({
      gym,
      report_month: reportMonth,
      summary: { text: result.answer, toolNames: [...new Set(result.toolCalls.map((c) => c.name))] },
    });
    if (insertError) throw new Error(`generateMissingDigests(${gym}): ${insertError.message}`);
    results.push({ gym, generated: true });
  }

  return results;
}

export async function getLatestDigest(gym: GymName): Promise<DigestRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("assist_digests")
    .select("gym, report_month, summary, created_at")
    .eq("gym", gym)
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestDigest: ${error.message}`);
  if (!data) return null;

  const summary = data.summary as { text: string; toolNames: string[] };
  return {
    gym: data.gym as GymName,
    reportMonth: data.report_month as string,
    summary: summary.text,
    toolNames: summary.toolNames ?? [],
    createdAt: data.created_at as string,
  };
}
