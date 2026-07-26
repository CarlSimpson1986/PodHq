import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "@/lib/data/types";

export type GymScope = { role: "admin"; gym: null } | { role: "owner"; gym: GymName };

/**
 * The role/gym pair every data-layer query is scoped by: admin sees
 * everything (gym: null), an owner is locked to the one gym on their
 * users_gyms row. Callers pass this straight into src/lib/data/* functions
 * rather than each of those re-deriving it from the session themselves.
 *
 * Uses the service-role client, not the caller's session client — RLS on
 * users_gyms is documented defense-in-depth (see the migration), not the
 * primary authorization path; every other data-layer query in this app
 * already queries via the admin client after checking the session
 * separately. This one used the session/RLS client and it was the actual
 * bug: RLS depends on auth.uid() resolving correctly for *this* request,
 * and a token-refresh timing gap can make it transiently resolve to
 * nothing — not an error, just zero rows, indistinguishable from "this
 * account genuinely has no gym" unless you already suspect it. `userId`
 * is already a verified value (the caller got it from supabase.auth.getUser()),
 * so there's no security reason to also require RLS to pass here.
 */
export async function getGymScope(userId: string): Promise<GymScope | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users_gyms")
    .select("role, gym")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getGymScope: ${error.message}`);
  if (!data) return null;

  if (data.role === "admin") return { role: "admin", gym: null };
  return { role: "owner", gym: data.gym as GymName };
}
