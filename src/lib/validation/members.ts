import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const memberInsightsQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();
