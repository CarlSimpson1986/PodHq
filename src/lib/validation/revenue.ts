import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const revenueSummaryQuerySchema = z
  .object({
    preset: z.enum(["last_month", "qtd", "last_quarter", "ytd", "full_year", "month"]).default("last_month"),
    year: z.coerce.number().int().min(2020).max(2100).optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();
