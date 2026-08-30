import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const createCardioEquipmentSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    name: z.string().min(1).max(100),
  })
  .strict();

export const updateCardioEquipmentSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    name: z.string().min(1).max(100),
  })
  .strict();

export const setCardioEquipmentEnabledSchema = z.object({ gym: z.enum(GYM_NAMES).optional(), enabled: z.boolean() }).strict();
