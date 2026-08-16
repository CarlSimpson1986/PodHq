import { GYM_NAMES, type GymName } from "@/lib/data/types";
import type { GymScope } from "./gym-scope";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

/**
 * The gym a route should actually act on: an owner is always locked to
 * their own gym regardless of what the client sent (a manipulated `gym`
 * query param/body field can never override this), an admin uses whatever
 * valid gym they selected, or null if they haven't selected one yet.
 *
 * Consolidated 2026-08-16 — this exact logic was duplicated
 * byte-for-byte across 12 route files (found with zero tests protecting
 * any of them during a security review). A fix or a bug in one copy
 * never propagated to the other 11; this is the one place it can now go
 * wrong, and it's the one place that's tested.
 */
export function resolveGym(scope: GymScope, gymParam: string | null | undefined): GymName | null {
  if (scope.role === "owner") return scope.gym;
  if (!gymParam || !isGymName(gymParam)) return null;
  return gymParam;
}
