import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listCatalogItems } from "@/lib/data/catalog";
import { CatalogView } from "@/components/setup/catalog-view";
import { BrevoConfigView } from "@/components/setup/brevo-config-view";
import { ResendConfigView } from "@/components/setup/resend-config-view";
import { AppShell } from "@/components/layout/app-shell";

// "Admin" means the franchisor specifically in this app, and pricing is a
// per-gym decision each franchisee makes for their own location — but the
// franchisor still needs full oversight, same fallback-access pattern as
// Outgoings/Other Income/Marketing (owner enters, admin can view/edit any
// gym they select). Setup shows in the nav for both roles; only the
// gym-locking differs (owner: always their own gym; admin: picks one via
// the same GymSelect used everywhere else, "All gyms" until they do).
//
// Brevo config is different: admin-only, no owner fallback at all. Unlike
// pricing (a business decision each franchisee should make for their own
// gym), entering a third-party API key is a technical credential-entry
// task tied to an account the franchisor sets up on the gym's behalf —
// there's no benefit to a franchisee touching the raw key themselves, and
// real risk of misconfiguration if they do.
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
  if (!scope) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">No gym or role is assigned to this account. Contact your admin.</p>
      </main>
    );
  }

  const gym = scope.role === "owner" ? scope.gym : null;
  const items = gym ? await listCatalogItems(gym) : [];

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <CatalogView role={scope.role} initialGym={gym} initialItems={items} />
        {scope.role === "admin" && (
          <>
            <BrevoConfigView initialGym={null} initialConfig={null} />
            <ResendConfigView initialGym={null} initialConfig={null} />
          </>
        )}
      </div>
    </AppShell>
  );
}
