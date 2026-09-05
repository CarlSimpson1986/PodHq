import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const startStripeConnectSchema = z
  .object({
    gym: z.enum(GYM_NAMES),
  })
  .strict();

// apiKey/webhookSecret/publishableKey are all optional here — a caller
// updating just one (most commonly publishableKey, added after the other
// two already exist) shouldn't need to look up and resupply secrets it
// isn't changing. upsertStripeStandaloneConfig enforces that apiKey and
// webhookSecret must exist somewhere (either in this call or already
// saved) before allowing the write.
export const upsertStripeStandaloneConfigSchema = z
  .object({
    gym: z.enum(GYM_NAMES),
    apiKey: z.string().trim().min(10).max(500).optional(),
    webhookSecret: z.string().trim().min(10).max(500).optional(),
    publishableKey: z.string().trim().min(10).max(500).optional(),
  })
  .strict()
  .refine((data) => data.apiKey || data.webhookSecret || data.publishableKey, {
    message: "Provide at least one field to update.",
  });
