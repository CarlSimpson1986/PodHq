import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getRevenueSummaryForRange } from "@/lib/data/revenue";
import { RevenueSummaryView } from "@/components/revenue/revenue-summary-view";
import { AppShell } from "@/components/layout/app-shell";

export default async function RevenuePage() {
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
        <p className="text-sm text-danger">
          No gym or role is assigned to this account. Contact your admin.
        </p>
      </main>
    );
  }

  const gym = scope.role === "owner" ? scope.gym : null;
  const summary = await getRevenueSummaryForRange(gym, "last_month");

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <RevenueSummaryView role={scope.role} initialPreset="last_month" initialGym={gym} initialSummary={summary} />
      </div>
    </AppShell>
  );
}
