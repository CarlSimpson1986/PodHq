import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getPodSettings, getBookingsForGymAndDate, getMembersForGym, getAccessEventsForGym } from "@/lib/data/pods";
import { PodsView } from "@/components/pods/pods-view";
import { AppShell } from "@/components/layout/app-shell";
import type { GymName } from "@/lib/data/types";

// Only Aylesbury Berryfields has a pod configured as of this pilot — a
// reasonable default to land admin on rather than an empty "pick a gym"
// state, same reasoning as the rest of this app's Aylesbury-only framing.
// An owner is always locked to their own gym regardless.
const DEFAULT_GYM: GymName = "Aylesbury Berryfields";

function todayDateParam(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function PodsPage() {
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
  const date = todayDateParam();

  const [settings, bookings, members, accessEvents] = await Promise.all([
    getPodSettings(gym),
    getBookingsForGymAndDate(gym, new Date(`${date}T00:00:00`)),
    getMembersForGym(gym),
    getAccessEventsForGym(gym, new Date(`${date}T00:00:00`)),
  ]);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <PodsView
          role={scope.role}
          initialGym={gym}
          initialDate={date}
          initialSettings={settings}
          initialBookings={bookings}
          initialMembers={members}
          initialAccessEvents={accessEvents}
        />
      </div>
    </AppShell>
  );
}
