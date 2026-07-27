import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthNextStep = "mfa_setup_required" | "mfa_required" | "ok";

/**
 * Decides what the client should do right after a session is established
 * (password login, magic link, or invite/recovery callback): force TOTP
 * enrolment for anyone who doesn't have it yet, send already-enrolled
 * users through an MFA challenge, or let them straight through.
 *
 * MFA is mandatory for every role, not just admin — found 2026-07-27 when
 * a freshly created owner test account reached the dashboard with zero
 * MFA prompt at all. This check used to be `if (role === "admin")`;
 * Supabase's own AAL check can't catch a no-factors-enrolled account on
 * its own (nextLevel only exceeds currentLevel once a factor exists), so
 * without an explicit universal check here, every non-admin role skipped
 * MFA setup entirely.
 */
export async function resolveNextAuthStep(supabase: SupabaseClient): Promise<AuthNextStep> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (!factors?.totp.length) return "mfa_setup_required";

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel !== aal.nextLevel) return "mfa_required";

  return "ok";
}
