import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getMemberInsightsSummary } from "@/lib/data/members";
import { getDefaultReportMonth } from "@/lib/data/dashboard";
import { MemberInsightsView } from "@/components/members/member-insights-view";
import { AppShell } from "@/components/layout/app-shell";

export default async function MembersPage() {
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
  const month = getDefaultReportMonth();
  const summary = await getMemberInsightsSummary(gym, month);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <MemberInsightsView role={scope.role} initialMonth={month} initialGym={gym} initialSummary={summary} />
      </div>
    </AppShell>
  );
}
