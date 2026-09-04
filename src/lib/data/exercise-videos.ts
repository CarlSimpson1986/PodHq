import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "exercise-videos";

export interface ExerciseVideoOverride {
  exerciseKey: string;
  videoUrl: string;
  uploadedAt: string;
}

// Public bucket — the URL is deterministic from the path, no signed read
// needed (see 0085_exercise_video_overrides.sql). Never trust a client-
// supplied URL, only ever build it here from the stored path.
function publicUrlFor(path: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL is not configured");
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function getExerciseVideoOverrides(): Promise<ExerciseVideoOverride[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("exercise_video_overrides").select("exercise_key, video_path, uploaded_at");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    exerciseKey: row.exercise_key,
    videoUrl: publicUrlFor(row.video_path),
    uploadedAt: row.uploaded_at,
  }));
}

export type CreateUploadUrlResult = { status: "ok"; signedUrl: string; token: string; path: string } | { status: "error"; message: string };

// A fresh path per upload (not a fixed one per exercise) — replacing a
// video is then just a new file + a DB row update, no cache-busting query
// param needed on the public URL, and the old file is cleaned up
// separately in deleteExerciseVideo/replace rather than overwritten in
// place.
export async function createExerciseVideoUploadUrl(exerciseKey: string): Promise<CreateUploadUrlResult> {
  const admin = createAdminClient();
  const path = `${exerciseKey}-${Date.now()}.mp4`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return { status: "error", message: error.message };
  return { status: "ok", signedUrl: data.signedUrl, token: data.token, path: data.path };
}

export type ConfirmUploadResult = { status: "ok" } | { status: "error"; message: string };

// Called after the browser's direct upload to the signed URL succeeds —
// deletes the previous file for this exercise (if any) before recording
// the new one, so replacing a video doesn't leave the old file orphaned
// in the bucket forever.
export async function confirmExerciseVideoUpload(exerciseKey: string, path: string, uploadedBy: string): Promise<ConfirmUploadResult> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("exercise_video_overrides")
    .select("video_path")
    .eq("exercise_key", exerciseKey)
    .maybeSingle();

  const { error } = await admin.from("exercise_video_overrides").upsert(
    {
      exercise_key: exerciseKey,
      video_path: path,
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "exercise_key" }
  );
  if (error) return { status: "error", message: error.message };

  if (existing?.video_path && existing.video_path !== path) {
    const { error: removeError } = await admin.storage.from(BUCKET).remove([existing.video_path]);
    if (removeError) {
      console.error("[exercise-videos] failed to remove old file after replace", { exerciseKey, error: removeError.message });
    }
  }

  return { status: "ok" };
}

export type DeleteResult = { status: "ok" } | { status: "error"; message: string };

// Reverts an exercise back to its YouTube fallback — deletes both the DB
// row and the stored file.
export async function deleteExerciseVideo(exerciseKey: string): Promise<DeleteResult> {
  const admin = createAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from("exercise_video_overrides")
    .select("video_path")
    .eq("exercise_key", exerciseKey)
    .maybeSingle();
  if (lookupError) return { status: "error", message: lookupError.message };
  if (!existing) return { status: "ok" };

  const { error: deleteError } = await admin.from("exercise_video_overrides").delete().eq("exercise_key", exerciseKey);
  if (deleteError) return { status: "error", message: deleteError.message };

  const { error: removeError } = await admin.storage.from(BUCKET).remove([existing.video_path]);
  if (removeError) {
    console.error("[exercise-videos] failed to remove file on delete", { exerciseKey, error: removeError.message });
  }

  return { status: "ok" };
}
