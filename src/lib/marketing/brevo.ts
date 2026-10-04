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

export interface AppLeadContact {
  email: string;
  firstName: string;
  lastName: string;
}

export type AppLeadSyncResult = "synced" | "no_config" | "failed";

/**
 * One member-app signup who ticked marketing consent, added to that gym's
 * Brevo list so its nurture workflow starts. Same upsert as the CSV path.
 * Called from /api/brevo/lead (podhq-client server only).
 */
export async function addAppLeadToBrevo(gym: GymName, contact: AppLeadContact): Promise<AppLeadSyncResult> {
  const config = await getDecryptedBrevoConfig(gym);
  if (!config) return "no_config";

  const res = await fetch(BREVO_CONTACTS_URL, {
    method: "POST",
    headers: { "api-key": config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: contact.email,
      attributes: { FIRSTNAME: contact.firstName, LASTNAME: contact.lastName },
      listIds: [config.listId],
      updateEnabled: true,
    }),
  });
  if (res.ok) return "synced";
  console.error("[brevo-sync] failed to add app lead", { gym, status: res.status });
  return "failed";
}

/**
 * Takes a lead off the gym's list once they've bought something — the
 * Brevo workflow is set to exit contacts who leave the list, which is what
 * stops the nurture emails. The contact itself stays in Brevo (only the
 * list membership goes), so their unsubscribe status is kept. Brevo
 * answers 400 when the contact is already off the list; that's the end
 * state we want, so it counts as done.
 */
export async function removeAppLeadFromBrevo(gym: GymName, email: string): Promise<AppLeadSyncResult> {
  const config = await getDecryptedBrevoConfig(gym);
  if (!config) return "no_config";

  const res = await fetch(`https://api.brevo.com/v3/contacts/lists/${config.listId}/contacts/remove`, {
    method: "POST",
    headers: { "api-key": config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ emails: [email] }),
  });
  if (res.ok || res.status === 400) return "synced";
  console.error("[brevo-sync] failed to remove app lead", { gym, status: res.status });
  return "failed";
}
