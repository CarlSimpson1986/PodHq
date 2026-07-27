"use client";

import { useEffect } from "react";

export default function OutgoingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[outgoings]", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-semibold tracking-wide text-accent">PodHQ</p>
      <h1 className="text-lg font-semibold text-foreground">Couldn&apos;t load P&amp;L data</h1>
      <p className="text-sm text-muted-foreground">Something went wrong fetching your data. Try again.</p>
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
