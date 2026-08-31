import type { ReactNode } from "react";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { AppShell } from "@/components/layout/app-shell";

// Shared shell (sidebar/mobile nav + the Pod Assist floating widget) for
// every authenticated route — previously each page duplicated this same
// getUser/getGymScope/<AppShell> wrap itself, which also meant no
// component here ever stayed mounted across a navigation (see the Pod
// Assist widget's design note: this is what makes it persist).
//
// The "not signed in" case is already handled by middleware (proxy.ts ->
// updateSession redirects a signed-out or MFA-pending request to /login
// before any route in this group renders) — kept here as a defensive
// fallback in case that redirect ever doesn't fire, same as every page
// used to do individually.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-danger">Not signed in.</p>
      </main>
    );
  }

  const scope = await getGymScope(user.id);
  if (!scope) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">No gym or role is assigned to this account. Contact your admin.</p>
      </main>
    );
  }

  return <AppShell role={scope.role}>{children}</AppShell>;
}
