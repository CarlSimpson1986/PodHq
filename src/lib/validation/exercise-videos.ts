import { z } from "zod";

// Matches podhq-client's EXERCISE_CATALOG key format exactly (lowercase,
// underscore-separated) — not validated against the actual catalog list
// here, that's src/lib/data/exercise-list.ts, used only for the admin
// picker UI, not as a source of truth this route enforces against.
const exerciseKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_]+$/);

export const createUploadUrlSchema = z
  .object({
    exerciseKey: exerciseKeySchema,
  })
  .strict();

export const confirmUploadSchema = z
  .object({
    exerciseKey: exerciseKeySchema,
    path: z.string().trim().min(1).max(300),
  })
  .strict();
