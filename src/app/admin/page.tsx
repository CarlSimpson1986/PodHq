import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getAllUsers, getSystemStatus } from "@/lib/data/admin";
import { AdminView } from "@/components/admin/admin-view";
import { AppShell } from "@/components/layout/app-shell";

export default async function AdminPage() {
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

  const [users, systemStatus] = await Promise.all([getAllUsers(), getSystemStatus()]);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <AdminView currentUserId={user.id} initialUsers={users} initialStatus={systemStatus} />
      </div>
    </AppShell>
  );
}
