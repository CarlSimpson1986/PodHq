import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listProfessionals, listRecentInquiries } from "@/lib/data/professionals";
import { ProfessionalsView } from "@/components/professionals/professionals-view";
import { AppShell } from "@/components/layout/app-shell";

// "Find a Professional" admin — Carl's own PT directory for podhq-client's
// member-facing marketplace (2026-08-27, modelled on Solo60's
// "Professional" tab). Admin-only, no owner view: unlike Chat Questions'
// FAQ half (which still lets an owner read, just not write), there's
// nothing gym-scoped here for an owner to see — every trainer profile is
// franchisor-level data shown to every gym's members.
export default async function ProfessionalsPage() {
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
  if (!scope || scope.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">Admins only.</p>
      </main>
    );
  }

  const [professionals, inquiries] = await Promise.all([listProfessionals(), listRecentInquiries()]);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ProfessionalsView initialItems={professionals} initialInquiries={inquiries} />
      </div>
    </AppShell>
  );
}
