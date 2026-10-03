"use client";

import { useMemo, useState } from "react";
import { EXERCISE_LIST } from "@/lib/data/exercise-list";
import { uploadToSignedUrl } from "@/lib/supabase/browser-storage-upload";
import { exerciseKeyFromFilename } from "@/lib/exercise-video-filename";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";

interface BulkProgress {
  done: number;
  total: number;
  succeeded: number;
  failed: string[];
  unmatched: string[];
  running: boolean;
}

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
  const [bulk, setBulk] = useState<BulkProgress | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? EXERCISE_LIST.filter((e) => e.name.toLowerCase().includes(q)) : EXERCISE_LIST;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [search]);

  // One file through the existing signed-upload flow (upload-url → direct
  // upload → confirm). Returns an error message, or null on success —
  // shared by the per-row Replace button and Bulk replace below.
  async function uploadOne(exerciseKey: string, file: File): Promise<string | null> {
    const urlRes = await fetch("/api/exercise-videos/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseKey }),
    });
    const urlBody = await urlRes.json();
    if (urlBody.status !== "ok") return urlBody.message ?? "Could not start upload.";

    await uploadToSignedUrl(urlBody.supabaseUrl, urlBody.anonKey, urlBody.path, urlBody.token, file);

    const confirmRes = await fetch("/api/exercise-videos/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseKey, path: urlBody.path }),
    });
    const confirmBody = await confirmRes.json();
    if (confirmBody.status !== "ok") return confirmBody.message ?? "Upload finished but could not be saved. Try again.";
    return null;
  }

  async function refreshOverrides() {
    const listRes = await fetch("/api/exercise-videos");
    const listBody = await listRes.json();
    if (listBody.status === "ok") {
      setOverrides(new Map(listBody.overrides.map((o: OverrideSummary) => [o.exerciseKey, o])));
    }
  }

  async function handleUpload(exerciseKey: string, file: File) {
    setError(null);
    setBusyKey(exerciseKey);
    try {
      const uploadError = await uploadOne(exerciseKey, file);
      if (uploadError) {
        setError(uploadError);
        return;
      }
      await refreshOverrides();
    } catch {
      setError("Something went wrong uploading that video. Try again.");
    } finally {
      setBusyKey(null);
    }
  }

  // Bulk replace (2026-10-03) — pick many files at once, each matched to
  // an exercise by filename (see exerciseKeyFromFilename). Sequential, not parallel, so a
  // big batch stays well inside the 100/min per-route rate limit; a 429 is
  // waited out and retried once rather than failing the rest of the batch.
  async function handleBulkUpload(files: File[]) {
    setError(null);
    const validKeys = new Set(EXERCISE_LIST.map((e) => e.key));
    const matched: { key: string; file: File }[] = [];
    const unmatched: string[] = [];
    for (const file of files) {
      const key = exerciseKeyFromFilename(file.name, validKeys);
      if (key) matched.push({ key, file });
      else unmatched.push(file.name);
    }

    const failed: string[] = [];
    let succeeded = 0;
    setBulk({ done: 0, total: matched.length, succeeded: 0, failed: [], unmatched, running: true });
    for (const [i, { key, file }] of matched.entries()) {
      try {
        let uploadError = await uploadOne(key, file);
        if (uploadError === "Too many requests.") {
          await new Promise((r) => setTimeout(r, 61_000));
          uploadError = await uploadOne(key, file);
        }
        if (uploadError) failed.push(`${file.name}: ${uploadError}`);
        else succeeded++;
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
      setBulk({ done: i + 1, total: matched.length, succeeded, failed: [...failed], unmatched, running: true });
    }
    setBulk({ done: matched.length, total: matched.length, succeeded, failed, unmatched, running: false });
    await refreshOverrides().catch(() => undefined);
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

      <div className="mt-4 rounded-md border border-card-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Bulk replace — select many videos at once. Each file must be named after its exercise key, e.g.{" "}
            <span className="font-mono text-xs">barbell_squat.mp4</span>.
          </p>
          <label className={`${secondaryButtonClass} flex-none cursor-pointer`}>
            {bulk?.running ? "Uploading..." : "Bulk replace"}
            <input
              type="file"
              accept="video/*"
              multiple
              disabled={bulk?.running || busyKey !== null}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length > 0) handleBulkUpload(files);
              }}
            />
          </label>
        </div>
        {bulk && (
          <div className="mt-2 text-sm" aria-live="polite">
            <p className="text-foreground">
              {bulk.running ? `Uploading ${bulk.done} of ${bulk.total}...` : `Done — ${bulk.succeeded} of ${bulk.total} uploaded.`}
            </p>
            {bulk.unmatched.length > 0 && (
              <p className="mt-1 text-danger">
                Skipped {bulk.unmatched.length} file{bulk.unmatched.length === 1 ? "" : "s"} not matching any exercise:{" "}
                {bulk.unmatched.join(", ")}
              </p>
            )}
            {bulk.failed.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-danger">
                {bulk.failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

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
                    disabled={busy || bulk?.running}
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
                    disabled={busy || bulk?.running}
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
