import { z } from "zod";
import { GYM_NAMES, LEAD_STATUSES } from "@/lib/data/types";

export const updateLeadStatusSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
  })
  .strict();

export const leadsQuerySchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();
