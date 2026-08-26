import { z } from "zod";

export const upsertFaqItemSchema = z
  .object({
    question: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(2000),
    displayOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
