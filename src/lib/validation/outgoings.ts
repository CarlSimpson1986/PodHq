import { z } from "zod";
import { GYM_NAMES, OUTGOING_CATEGORIES } from "@/lib/data/types";

export const createOutgoingSchema = z
  .object({
    category: z.enum(OUTGOING_CATEGORIES),
    amountGbp: z.number().nonnegative(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/),
    // Required when the caller is admin, ignored/overridden by the
    // session's own gym when the caller is an owner — enforced in the route.
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();

export const pnlSummaryQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();
