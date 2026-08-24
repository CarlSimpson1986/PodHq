import { z } from "zod";
import { GYM_NAMES, EQUIPMENT_TYPES } from "@/lib/data/types";

export const podBookingsQuerySchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const createManualBookingSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    resourceId: z.number().int().positive(),
    memberId: z.number().int().positive(),
    // Minute-level here — the actual on-the-hour-or-half-hour alignment is
    // resource-duration-specific (30 vs 60 min) and validated server-side
    // by create_booking() itself, which is the only place that knows a
    // given resource's slot_duration_minutes.
    slotStart: z.string().refine((v) => {
      const d = new Date(v);
      return !Number.isNaN(d.getTime()) && d.getSeconds() === 0 && d.getMilliseconds() === 0;
    }, "Invalid slot."),
  })
  .strict();

export const podCalendarQuerySchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const podSlotQuerySchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    resourceId: z.coerce.number().int().positive(),
    slotStart: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid slot."),
  })
  .strict();

export const cancelBookingSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    bookingId: z.number().int().positive(),
  })
  .strict();

export const grantCreditSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    memberId: z.number().int().positive(),
    amount: z.number().int().min(1).max(20),
  })
  .strict();

export const setFoundingMemberSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    memberId: z.number().int().positive(),
    foundingMember: z.boolean(),
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
    resourceId: z.number().int().positive(),
    podCapacity: z.number().int().min(1).max(50),
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(1).max(24),
    equipment: z.array(z.enum(EQUIPMENT_TYPES)),
  })
  .strict()
  .refine((v) => v.openHour < v.closeHour, { message: "Open hour must be before close hour.", path: ["openHour"] });
