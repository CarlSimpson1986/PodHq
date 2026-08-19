import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const startStripeConnectSchema = z
  .object({
    gym: z.enum(GYM_NAMES),
  })
  .strict();
