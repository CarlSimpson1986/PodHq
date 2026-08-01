import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const parseAdSpendSchema = z
  .object({
    // Required when the caller is admin, ignored/overridden by the
    // session's own gym when the caller is an owner — enforced in the route.
    gym: z.enum(GYM_NAMES).optional(),
    // At least one of the two must be present — a franchisee may paste one
    // export before the other, and a week appearing in only one file still
    // has a real number worth previewing (see refine below).
    metaCsv: z.string().max(5_000_000, "CSV is too large.").optional(),
    leadsCsv: z.string().max(5_000_000, "CSV is too large.").optional(),
  })
  .strict()
  .refine((data) => Boolean(data.metaCsv) || Boolean(data.leadsCsv), {
    message: "At least one CSV must be provided.",
  });

export const adSpendWeekSchema = z
  .object({
    weekStarting: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    spendGbp: z.number().nonnegative(),
    clicks: z.number().int().nonnegative(),
    leads: z.number().int().nonnegative(),
  })
  .strict();

export const leadDraftSchema = z
  .object({
    leadSourceId: z.string().min(1),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    createdDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const confirmAdSpendSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    weeks: z.array(adSpendWeekSchema).min(1),
    leads: z.array(leadDraftSchema).max(5000).optional(),
  })
  .strict();

export const marketingSummaryQuerySchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();

export const clearMarketingDataSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();
