import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const podBookingsQuerySchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const createManualBookingSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    memberId: z.number().int().positive(),
    // On-the-hour, matching the DB check on bookings.slot_start.
    slotStart: z.string().refine((v) => {
      const d = new Date(v);
      return !Number.isNaN(d.getTime()) && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
    }, "Slot must be on the hour."),
  })
  .strict();

export const podSettingsQuerySchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();

export const updatePodSettingsSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    podCapacity: z.number().int().min(1).max(50),
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(1).max(24),
  })
  .strict()
  .refine((v) => v.openHour < v.closeHour, { message: "Open hour must be before close hour.", path: ["openHour"] });
