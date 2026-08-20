import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const createCouponSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    code: z.string().min(2).max(30),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.number().positive().max(10000),
    usageLimitType: z.enum(["once_per_member", "total_cap", "unlimited"]),
    usageLimitValue: z.number().int().positive().max(100000).optional(),
    itemIds: z.array(z.number().int().positive()).min(1).max(100),
  })
  .strict()
  .refine((data) => data.usageLimitType !== "total_cap" || typeof data.usageLimitValue === "number", {
    message: "A total-cap coupon needs a usage limit value.",
    path: ["usageLimitValue"],
  })
  .refine((data) => data.discountType !== "percentage" || data.discountValue <= 100, {
    message: "A percentage discount can't exceed 100.",
    path: ["discountValue"],
  });

export const setCouponEnabledSchema = z.object({ gym: z.enum(GYM_NAMES).optional(), enabled: z.boolean() }).strict();
