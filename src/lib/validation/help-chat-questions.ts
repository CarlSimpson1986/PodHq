import { z } from "zod";

// addToFaq lets staff resolve a question and publish the answer to the
// live FAQ in one step — displayOrder only required in that case, the
// review queue itself doesn't need to think about ordering.
export const resolveChatQuestionSchema = z
  .object({
    gym: z.string().trim().min(1).max(100).optional(),
    addToFaq: z
      .object({
        answer: z.string().trim().min(1).max(2000),
        displayOrder: z.number().int().min(0).max(1000).default(0),
      })
      .optional(),
  })
  .strict();
