import { createSessionClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/sign-out-button";

// Placeholder — Stage 4 replaces this with the real admin/owner dashboard.
export default async function DashboardPage() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-semibold tracking-wide text-accent">PodHQ</p>
      <h1 className="text-xl font-semibold text-foreground">You&apos;re signed in</h1>
      <p className="text-sm text-muted-foreground">{user?.email}</p>
      <p className="text-sm text-muted-foreground">The real dashboard lands in Stage 4.</p>
      <SignOutButton />
    </main>
  );
}
