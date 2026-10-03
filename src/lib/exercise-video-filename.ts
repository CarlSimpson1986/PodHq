// Matches a bulk-uploaded video file to an exercise key by filename —
// "barbell_squat.mp4", or the storage bucket's own
// "barbell_squat-1788695898979.mp4" form. Returns null when the name
// doesn't correspond to any known exercise.
export function exerciseKeyFromFilename(filename: string, validKeys: ReadonlySet<string>): string | null {
  const base = filename.replace(/\.[^.]+$/, "").toLowerCase();
  if (validKeys.has(base)) return base;
  const withoutTimestamp = base.replace(/-\d+$/, "");
  return validKeys.has(withoutTimestamp) ? withoutTimestamp : null;
}
