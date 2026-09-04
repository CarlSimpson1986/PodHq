import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getExerciseVideoOverrides } from "@/lib/data/exercise-videos";
import { ExerciseVideosView } from "@/components/exercise-videos/exercise-videos-view";

// Franchise-wide, admin-only — not under /setup's per-gym flow, since
// exercise videos aren't a gym's own config, they're shared training
// content used by podhq-client across every gym.
export default async function ExerciseVideosPage() {
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

  const overrides = await getExerciseVideoOverrides();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <ExerciseVideosView initialOverrides={overrides} />
    </div>
  );
}
