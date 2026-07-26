import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GymName } from "@/lib/data/types";

export type GymScope = { role: "admin"; gym: null } | { role: "owner"; gym: GymName };

/**
 * The role/gym pair every data-layer query is scoped by: admin sees
 * everything (gym: null), an owner is locked to the one gym on their
 * users_gyms row. Callers pass this straight into src/lib/data/* functions
 * rather than each of those re-deriving it from the session themselves.
 */
export async function getGymScope(
  supabase: SupabaseClient,
  userId: string
): Promise<GymScope | null> {
  const { data } = await supabase
    .from("users_gyms")
    .select("role, gym")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  if (data.role === "admin") return { role: "admin", gym: null };
  return { role: "owner", gym: data.gym as GymName };
}
