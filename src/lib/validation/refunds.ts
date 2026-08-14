import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const transactionsQuerySchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();

export const createRefundSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    type: z.enum(["credit_pack", "membership", "gift_voucher"]),
    id: z.number().int().positive(),
  })
  .strict();
