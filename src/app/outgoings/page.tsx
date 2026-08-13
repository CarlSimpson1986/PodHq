import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getPnlSummary, getOutgoingsHistory, getOutgoingTransactions, getOutgoingsMonthlyHistory } from "@/lib/data/outgoings";
import { getOtherIncomeHistory, getOtherIncomeMonthlyHistory } from "@/lib/data/other-income";
import { getDefaultReportMonth } from "@/lib/data/dashboard";
import { OutgoingsView } from "@/components/outgoings/outgoings-view";
import { AppShell } from "@/components/layout/app-shell";

export default async function OutgoingsPage() {
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

  // Admin defaults to "All gyms" (no filter) on first load.
  const month = getDefaultReportMonth();
  const summary = await getPnlSummary(scope, null, month);
  const historyGym = scope.role === "owner" ? scope.gym : null;
  const [history, transactions, monthlyHistory, otherIncomeHistory, otherIncomeMonthlyHistory] = historyGym
    ? await Promise.all([
        getOutgoingsHistory(historyGym),
        getOutgoingTransactions(historyGym),
        getOutgoingsMonthlyHistory(historyGym),
        getOtherIncomeHistory(historyGym),
        getOtherIncomeMonthlyHistory(historyGym),
      ])
    : [null, null, null, null, null];

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <OutgoingsView
          role={scope.role}
          initialMonth={month}
          initialGym={scope.role === "owner" ? scope.gym : null}
          initialSummary={summary}
          initialHistory={history}
          initialTransactions={transactions}
          initialMonthlyHistory={monthlyHistory}
          initialOtherIncomeHistory={otherIncomeHistory}
          initialOtherIncomeMonthlyHistory={otherIncomeMonthlyHistory}
        />
      </div>
    </AppShell>
  );
}
