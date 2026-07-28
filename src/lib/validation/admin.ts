import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const createOwnerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    gym: z.enum(GYM_NAMES),
  })
  .strict();
