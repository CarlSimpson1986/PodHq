import { z } from "zod";

export const createCatalogItemSchema = z
  .object({
    type: z.enum(["credit_pack", "membership"]),
    name: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    credits: z.number().int().positive().max(1000),
    priceGBP: z.number().positive().max(10000),
  })
  .strict();

export const updateCatalogItemSchema = z
  .object({
    name: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    credits: z.number().int().positive().max(1000),
    priceGBP: z.number().positive().max(10000),
  })
  .strict();

export const setCatalogItemEnabledSchema = z.object({ enabled: z.boolean() }).strict();
