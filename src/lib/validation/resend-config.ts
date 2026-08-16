import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const upsertResendConfigSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    apiKey: z.string().min(10).max(500),
    fromAddress: z.string().trim().email().max(200),
    fromName: z.string().trim().min(1).max(100),
  })
  .strict();
