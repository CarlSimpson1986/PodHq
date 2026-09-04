"use client";

import { useMemo, useState } from "react";
import { EXERCISE_LIST } from "@/lib/data/exercise-list";
import { uploadToSignedUrl } from "@/lib/supabase/browser-storage-upload";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";

interface OverrideSummary {
  exerciseKey: string;
  videoUrl: string;
  uploadedAt: string;
}

// Franchise-wide admin tool — upload Carl's own exercise-technique videos
// to replace the third-party YouTube clips in podhq-client's static
// EXERCISE_CATALOG, one exercise at a time. EXERCISE_LIST (src/lib/data/
// exercise-list.ts) is a deliberately lightweight duplicate of that
// catalog's key/name/muscleGroup, generated 2026-09-04 — see its own
// header comment for why this doesn't go through the shared DB like every
// other cross-app config on this page.
export function ExerciseVideosView({ initialOverrides }: { initialOverrides: OverrideSummary[] }) {
  const [overrides, setOverrides] = useState<Map<string, OverrideSummary>>(
    new Map(initialOverrides.map((o) => [o.exerciseKey, o]))
  );
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? EXERCISE_LIST.filter((e) => e.name.toLowerCase().includes(q)) : EXERCISE_LIST;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [search]);

  async function handleUpload(exerciseKey: string, file: File) {
    setError(null);
    setBusyKey(exerciseKey);
    try {
      const urlRes = await fetch("/api/exercise-videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseKey }),
      });
      const urlBody = await urlRes.json();
      if (urlBody.status !== "ok") {
        setError(urlBody.message ?? "Could not start upload.");
        return;
      }

      await uploadToSignedUrl(urlBody.path, urlBody.token, file);

      const confirmRes = await fetch("/api/exercise-videos/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseKey, path: urlBody.path }),
      });
      const confirmBody = await confirmRes.json();
      if (confirmBody.status !== "ok") {
        setError(confirmBody.message ?? "Upload finished but could not be saved. Try again.");
        return;
      }

      const listRes = await fetch("/api/exercise-videos");
      const listBody = await listRes.json();
      if (listBody.status === "ok") {
        setOverrides(new Map(listBody.overrides.map((o: OverrideSummary) => [o.exerciseKey, o])));
      }
    } catch {
      setError("Something went wrong uploading that video. Try again.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove(exerciseKey: string) {
    setError(null);
    setBusyKey(exerciseKey);
    try {
      const res = await fetch(`/api/exercise-videos/${encodeURIComponent(exerciseKey)}`, { method: "DELETE" });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not remove this video.");
        return;
      }
      setOverrides((prev) => {
        const next = new Map(prev);
        next.delete(exerciseKey);
        return next;
      });
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Exercise videos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload your own technique videos to replace the third-party YouTube clips, one exercise at a time. An
        exercise with nothing uploaded keeps using its YouTube fallback.
      </p>

      <input
        type="text"
        placeholder="Search exercises..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4 w-full max-w-sm rounded-md border border-card-border bg-card px-3 py-1.5 text-sm text-foreground"
      />

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <ul className="mt-4 space-y-2">
        {filtered.map((exercise) => {
          const override = overrides.get(exercise.key);
          const busy = busyKey === exercise.key;
          return (
            <li
              key={exercise.key}
              className="flex items-center justify-between gap-3 rounded-md border border-card-border p-3"
            >
              <div className="text-sm">
                <p className="text-foreground">
                  {exercise.name} <span className="text-muted-foreground">({exercise.muscleGroup})</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {override
                    ? `Your video — uploaded ${new Date(override.uploadedAt).toLocaleDateString("en-GB")}`
                    : "Using YouTube fallback"}
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                <label className={`${secondaryButtonClass} cursor-pointer`}>
                  {busy ? "Working..." : override ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="video/*"
                    disabled={busy}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) handleUpload(exercise.key, file);
                    }}
                  />
                </label>
                {override && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRemove(exercise.key)}
                    className={buttonClass}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
