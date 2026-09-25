import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";
import { DOOR_TRAFFIC_PRESETS } from "@/lib/data/door-traffic-presets";

export const doorTrafficQuerySchema = z
  .object({
    preset: z.enum(DOOR_TRAFFIC_PRESETS).default("last_30_days"),
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();
