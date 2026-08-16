import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const upsertBrevoConfigSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    apiKey: z.string().min(10).max(500),
    listId: z.number().int().positive(),
  })
  .strict();
