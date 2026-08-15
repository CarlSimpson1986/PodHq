import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

const itemType = z.enum(["credit_pack", "membership"]);

export const compSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    memberId: z.number().int().positive(),
    type: itemType,
    itemId: z.string().min(1),
    // Only meaningful for type: "membership" — an optional cutoff date for a comp that shouldn't run forever.
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export const createSalesCheckoutSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    memberId: z.number().int().positive(),
    type: itemType,
    itemId: z.string().min(1),
    priceGBP: z.number().positive().max(10000),
    // Only meaningful for type: "membership" when priceGBP is a discount off the tier's listed price.
    discountMode: z.enum(["ongoing", "first_payment_only"]).optional(),
  })
  .strict();

export const salesCheckoutStatusSchema = z
  .object({
    memberId: z.number().int().positive(),
    sessionId: z.string().min(1),
  })
  .strict();
