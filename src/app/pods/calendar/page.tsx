import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getPodSettings, getMembersForGym } from "@/lib/data/pods";
import { CalendarView } from "@/components/pods/calendar-view";
import { AppShell } from "@/components/layout/app-shell";
import type { GymName } from "@/lib/data/types";

// Only Aylesbury Berryfields has a pod configured as of this pilot — same
// default reasoning as the rest of this app.
const DEFAULT_GYM: GymName = "Aylesbury Berryfields";

export default async function CalendarPage() {
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

  const [settings, members] = await Promise.all([getPodSettings(gym), getMembersForGym(gym)]);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <CalendarView role={scope.role} initialGym={gym} initialSettings={settings} initialMembers={members} />
      </div>
    </AppShell>
  );
}
