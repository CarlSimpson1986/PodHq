"use client";

import { useEffect } from "react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin]", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-semibold tracking-wide text-accent">PodHQ</p>
      <h1 className="text-lg font-semibold text-foreground">Couldn&apos;t load the admin panel</h1>
      <p className="text-sm text-muted-foreground">Something went wrong fetching this data. Try again.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Retry
      </button>
    </main>
  );
}
