import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const brevoLeadSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("add"),
      gym: z.enum(GYM_NAMES),
      email: z.string().trim().toLowerCase().email(),
      firstName: z.string().trim().max(100),
      lastName: z.string().trim().max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("remove"),
      gym: z.enum(GYM_NAMES),
      email: z.string().trim().toLowerCase().email(),
    })
    .strict(),
]);
