import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const createCatalogItemSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    type: z.enum(["credit_pack", "membership"]),
    name: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    credits: z.number().int().positive().max(1000),
    priceGBP: z.number().positive().max(10000),
    oneTimePerMember: z.boolean().optional(),
  })
  .strict();

export const updateCatalogItemSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    name: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    credits: z.number().int().positive().max(1000),
    priceGBP: z.number().positive().max(10000),
    oneTimePerMember: z.boolean(),
  })
  .strict();

export const setCatalogItemEnabledSchema = z.object({ gym: z.enum(GYM_NAMES).optional(), enabled: z.boolean() }).strict();
