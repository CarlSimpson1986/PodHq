import "server-only";
import type { GymName } from "@/lib/data/types";
import { getDecryptedBrevoConfig } from "@/lib/data/brevo-config";
import type { LeadDraft } from "./parse";

const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";

/**
 * Pushes uploaded leads into that gym's Brevo list, so the automation
 * workflow configured there picks them up. Each franchisee has their own
 * Brevo account (own business name, own sender email) — not one shared
 * account with per-gym lists, so the API key + list id come from
 * gym_brevo_config (Setup, src/lib/data/brevo-config.ts), not a single env
 * var. Best-effort and silent on missing config: the `leads` table (not
 * Brevo) is the source of truth for CPL/recent-leads, so a Brevo outage or
 * a gym with no account set up yet must never block saving the upload.
 * `updateEnabled: true` makes this an upsert on email, matching the
 * re-upload-overwrites-cleanly convention used for `leads`/`ad_spend`
 * elsewhere — re-syncing an already-listed contact just updates their
 * name, it doesn't re-trigger list entry.
 */
export async function syncLeadsToBrevo(gym: GymName, leads: LeadDraft[]): Promise<void> {
  if (leads.length === 0) return;
  const config = await getDecryptedBrevoConfig(gym);
  if (!config) return;
  const { apiKey, listId } = config;

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
