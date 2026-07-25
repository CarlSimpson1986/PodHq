import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthNextStep = "mfa_setup_required" | "mfa_required" | "ok";

/**
 * Decides what the client should do right after a session is established
 * (password login, magic link, or invite/recovery callback): force TOTP
 * enrolment for admins who don't have it yet, send already-enrolled users
 * through an MFA challenge, or let them straight through.
 */
export async function resolveNextAuthStep(
  supabase: SupabaseClient,
  userId: string
): Promise<AuthNextStep> {
  const { data: gymRows } = await supabase
    .from("users_gyms")
    .select("role")
    .eq("user_id", userId)
    .limit(1);
  const role = gymRows?.[0]?.role;

  if (role === "admin") {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    if (!factors?.totp.length) return "mfa_setup_required";
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel !== aal.nextLevel) return "mfa_required";

  return "ok";
}
