import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listCatalogItems } from "@/lib/data/catalog";
import { CatalogView } from "@/components/setup/catalog-view";
import { AppShell } from "@/components/layout/app-shell";

// Owner-only, deliberately: "admin" means the franchisor specifically in
// this app, and pricing is a per-gym decision each franchisee makes for
// their own location, not something the franchisor sets or needs fallback
// access to (unlike gym_outgoings/other_income, which admin *can* edit for
// oversight — pricing doesn't follow that pattern here, by explicit
// request). Admin currently has zero visibility into any gym's catalog as
// a result — flagged, not yet revisited.
export default async function SetupPage() {
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
  if (!scope || scope.role !== "owner") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">Owners only.</p>
      </main>
    );
  }

  const items = await listCatalogItems(scope.gym);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <CatalogView initialItems={items} />
      </div>
    </AppShell>
  );
}
