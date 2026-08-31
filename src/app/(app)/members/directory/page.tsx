import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getCustomerDirectory } from "@/lib/data/members";
import { CustomerDirectoryView } from "@/components/members/customer-directory-view";

export default async function CustomerDirectoryPage() {
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
  const customers = await getCustomerDirectory(gym);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <CustomerDirectoryView role={scope.role} initialGym={gym} initialCustomers={customers} />
    </div>
  );
}
