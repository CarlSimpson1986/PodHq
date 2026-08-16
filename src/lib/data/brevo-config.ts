import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-encryption";
import type { GymName } from "./types";

export interface BrevoConfigSummary {
  hasKey: boolean;
  listId: number | null;
  updatedAt: string | null;
}

/** Masked view for the Setup UI — the real key is never returned here. */
export async function getBrevoConfigSummary(gym: GymName): Promise<BrevoConfigSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_brevo_config")
    .select("list_id, updated_at")
    .eq("gym", gym)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { hasKey: false, listId: null, updatedAt: null };
  return { hasKey: true, listId: data.list_id, updatedAt: data.updated_at };
}

/**
 * Decrypted key for actually calling Brevo's API — internal use only
 * (src/lib/marketing/brevo.ts), never exposed through an API route.
 */
export async function getDecryptedBrevoConfig(gym: GymName): Promise<{ apiKey: string; listId: number } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_brevo_config")
    .select("api_key_encrypted, list_id")
    .eq("gym", gym)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { apiKey: decryptSecret(data.api_key_encrypted), listId: data.list_id };
}

export type UpsertBrevoConfigResult = { status: "ok" } | { status: "error"; message: string };

export async function upsertBrevoConfig(
  gym: GymName,
  apiKey: string,
  listId: number,
  updatedBy: string
): Promise<UpsertBrevoConfigResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("gym_brevo_config").upsert(
    {
      gym,
      api_key_encrypted: encryptSecret(apiKey),
      list_id: listId,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "gym" }
  );
  if (error) return { status: "error", message: error.message };
  return { status: "ok" };
}
