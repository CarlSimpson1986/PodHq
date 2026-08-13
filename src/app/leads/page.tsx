import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getRecentLeads } from "@/lib/data/marketing";
import { LeadsView } from "@/components/leads/leads-view";
import { AppShell } from "@/components/layout/app-shell";

export default async function LeadsPage() {
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

  // Admin defaults to "All gyms" (no filter) on first load, same as Marketing.
  const gym = scope.role === "owner" ? scope.gym : null;
  const leads = gym ? await getRecentLeads(gym) : null;

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <LeadsView role={scope.role} initialGym={gym} initialLeads={leads} />
      </div>
    </AppShell>
  );
}
