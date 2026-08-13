import { z } from "zod";
import { GYM_NAMES, OTHER_INCOME_CATEGORIES } from "@/lib/data/types";

export const createOtherIncomeSchema = z
  .object({
    category: z.enum(OTHER_INCOME_CATEGORIES),
    amountGbp: z.number().nonnegative(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/),
    // Optional memo, e.g. "Xyz Corp contract" — never used for grouping or
    // comparability across gyms, purely a display-only note on the entry.
    label: z.string().trim().max(200).optional(),
    // Required when the caller is admin, ignored/overridden by the
    // session's own gym when the caller is an owner — enforced in the route.
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();
