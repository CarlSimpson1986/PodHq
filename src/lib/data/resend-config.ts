import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto/secret-encryption";
import type { GymName } from "./types";

export interface ResendConfigSummary {
  hasKey: boolean;
  fromAddress: string | null;
  fromName: string | null;
  updatedAt: string | null;
}

/** Masked view for the Setup UI — the real key is never returned here. */
export async function getResendConfigSummary(gym: GymName): Promise<ResendConfigSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_resend_config")
    .select("from_address, from_name, updated_at")
    .eq("gym", gym)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { hasKey: false, fromAddress: null, fromName: null, updatedAt: null };
  return { hasKey: true, fromAddress: data.from_address, fromName: data.from_name, updatedAt: data.updated_at };
}

export type UpsertResendConfigResult = { status: "ok" } | { status: "error"; message: string };

export async function upsertResendConfig(
  gym: GymName,
  apiKey: string,
  fromAddress: string,
  fromName: string,
  updatedBy: string
): Promise<UpsertResendConfigResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("gym_resend_config").upsert(
    {
      gym,
      api_key_encrypted: encryptSecret(apiKey),
      from_address: fromAddress,
      from_name: fromName,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "gym" }
  );
  if (error) return { status: "error", message: error.message };
  return { status: "ok" };
}
