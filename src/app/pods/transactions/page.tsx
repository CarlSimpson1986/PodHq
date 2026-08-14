import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getRecentTransactions } from "@/lib/data/refunds";
import { TransactionsView } from "@/components/pods/transactions-view";
import { AppShell } from "@/components/layout/app-shell";
import type { GymName } from "@/lib/data/types";

// Same default as /pods — only Aylesbury Berryfields has a pod configured
// as of this pilot. An owner is always locked to their own gym regardless.
const DEFAULT_GYM: GymName = "Aylesbury Berryfields";

export default async function PodsTransactionsPage() {
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

  const gym = scope.role === "owner" ? scope.gym : DEFAULT_GYM;
  const transactions = await getRecentTransactions(gym);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <TransactionsView role={scope.role} initialGym={gym} initialTransactions={transactions} />
      </div>
    </AppShell>
  );
}
