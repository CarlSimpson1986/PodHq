import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const upsertProfessionalSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    photoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
    bio: z.string().trim().max(2000).default(""),
    qualifications: z.string().trim().max(500).default(""),
    specialties: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    gyms: z.array(z.enum(GYM_NAMES)).max(GYM_NAMES.length).default([]),
    pricePerHourGbp: z.number().min(0).max(1000),
    active: z.boolean().default(true),
    displayOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
