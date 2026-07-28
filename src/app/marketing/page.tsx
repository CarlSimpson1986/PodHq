import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getMarketingSummary } from "@/lib/data/marketing";
import { MarketingView } from "@/components/marketing/marketing-view";
import { AppShell } from "@/components/layout/app-shell";

export default async function MarketingPage() {
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

  // Admin defaults to "All gyms" (no filter) on first load, same as Outgoings.
  const gym = scope.role === "owner" ? scope.gym : null;
  const summary = await getMarketingSummary(gym);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <MarketingView role={scope.role} initialGym={gym} initialSummary={summary} />
      </div>
    </AppShell>
  );
}
