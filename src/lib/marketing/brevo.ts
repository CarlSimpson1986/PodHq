import "server-only";
import type { GymName } from "@/lib/data/types";
import type { LeadDraft } from "./parse";

const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";

/**
 * One nurture list (and workflow) per gym in Brevo, so email copy can
 * reference the right location by name rather than one generic sequence
 * for every franchise. Not a secret, so kept here rather than in env — same
 * reasoning as GYM_NAMES in src/lib/data/types.ts already being hardcoded
 * rather than configured. Partial: a gym with no entry yet (list/workflow
 * not built in Brevo yet) is silently skipped, same as the whole feature
 * being unconfigured today.
 */
const GYM_BREVO_LIST_IDS: Partial<Record<GymName, number>> = {
  "Aylesbury Berryfields": 5,
};

/**
 * Pushes uploaded leads into that gym's Brevo list, so the automation
 * workflow configured there picks them up. Best-effort and silent on
 * missing config: the `leads` table (not Brevo) is the source of truth for
 * CPL/recent-leads, so a Brevo outage or a gym with no list set up yet must
 * never block saving the upload. `updateEnabled: true` makes this an
 * upsert on email, matching the re-upload-overwrites-cleanly convention
 * used for `leads`/`ad_spend` elsewhere — re-syncing an already-listed
 * contact just updates their name, it doesn't re-trigger list entry.
 */
export async function syncLeadsToBrevo(gym: GymName, leads: LeadDraft[]): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = GYM_BREVO_LIST_IDS[gym];
  if (!apiKey || !listId || leads.length === 0) return;

  const results = await Promise.allSettled(
    leads.map((lead) =>
      fetch(BREVO_CONTACTS_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: lead.email,
          attributes: { FIRSTNAME: lead.firstName, LASTNAME: lead.lastName },
          listIds: [listId],
          updateEnabled: true,
        }),
      }).then(async (res) => {
        if (!res.ok && res.status !== 204) {
          throw new Error(`Brevo ${res.status}: ${await res.text()}`);
        }
      })
    )
  );

  const failedCount = results.filter((r) => r.status === "rejected").length;
  if (failedCount > 0) {
    console.error("[brevo-sync] failed to sync some leads", { gym, failedCount, totalCount: leads.length });
  }
}
