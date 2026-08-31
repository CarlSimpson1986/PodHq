import { z } from "zod";
import { GYM_NAMES } from "@/lib/data/types";

export const assistQuerySchema = z
  .object({
    question: z.string().min(1).max(500),
    // Admin only — an explicit gym-picker selection on the request itself.
    // Never derived from `question`'s text: see src/lib/assist/tools.ts's
    // AssistContext doc comment for why that boundary matters. Ignored
    // entirely for an owner (resolveAssistContext always uses their own
    // gym regardless of what's sent here).
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();
