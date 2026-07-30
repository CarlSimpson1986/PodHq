import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getCustomerProfile } from "@/lib/data/members";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { CustomerProfileView } from "@/components/members/customer-profile-view";
import { AppShell } from "@/components/layout/app-shell";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ gym: string; name: string }>;
}) {
  const { gym: rawGymParam, name: rawNameParam } = await params;
  // This Next.js version does not auto-decode dynamic route segments (unlike
  // the classic behaviour) — segments arrive exactly as sent over the wire,
  // e.g. "Aylesbury%20Berryfields" rather than "Aylesbury Berryfields".
  const gymParam = decodeURIComponent(rawGymParam);
  const nameParam = decodeURIComponent(rawNameParam);

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

  if (!isGymName(gymParam)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">Unknown gym.</p>
      </main>
    );
  }

  // Security: an owner can only ever view their own gym's customers,
  // regardless of what gym the URL asks for — same rule every API route in
  // this app already enforces for the `gym` query param.
  if (scope.role === "owner" && scope.gym !== gymParam) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">You don&apos;t have access to this gym&apos;s data.</p>
      </main>
    );
  }

  const profile = await getCustomerProfile(gymParam, nameParam);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <CustomerProfileView gym={gymParam} name={nameParam} profile={profile} />
      </div>
    </AppShell>
  );
}
