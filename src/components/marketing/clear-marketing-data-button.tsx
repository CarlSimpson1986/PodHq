"use client";

import { useState } from "react";
import type { GymName } from "@/lib/data/types";

const dangerButtonClass =
  "rounded-md border border-danger/50 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50";

interface ClearMarketingDataButtonProps {
  gym: GymName;
  isAdmin: boolean;
  onCleared: () => void;
}

export function ClearMarketingDataButton({ gym, isAdmin, onCleared }: ClearMarketingDataButtonProps) {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleClear() {
    const confirmed = confirm(
      `Permanently delete ALL marketing data for ${gym} — every week of ad spend and every lead? This cannot be undone.`
    );
    if (!confirmed) return;

    setError(null);
    setResult(null);
    setClearing(true);
    try {
      const res = await fetch("/api/marketing/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAdmin ? { gym } : {}),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not clear this data.");
        return;
      }
      setResult(`Deleted ${body.adSpendDeleted} week(s) of ad spend and ${body.leadsDeleted} lead(s).`);
      onCleared();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Clear marketing data — {gym}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Permanently deletes every week of ad spend and every lead for this gym. There is no undo — use this to
        start fresh, not to fix a single mistake (delete a specific week or re-upload instead for that).
      </p>
      <button type="button" onClick={handleClear} disabled={clearing} className={`${dangerButtonClass} mt-4`}>
        {clearing ? "Clearing..." : "Clear all data for this gym"}
      </button>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {result && <p className="mt-3 text-sm text-muted-foreground">{result}</p>}
    </div>
  );
}
