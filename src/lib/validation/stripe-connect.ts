import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const startStripeConnectSchema = z
  .object({
    gym: z.enum(GYM_NAMES),
  })
  .strict();

export const upsertStripeStandaloneConfigSchema = z
  .object({
    gym: z.enum(GYM_NAMES),
    apiKey: z.string().trim().min(10).max(500),
    webhookSecret: z.string().trim().min(10).max(500),
    publishableKey: z.string().trim().min(10).max(500),
  })
  .strict();
