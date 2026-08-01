import { z } from "zod";
import { GYM_NAMES, OUTGOING_CATEGORIES } from "@/lib/data/types";

export const createOutgoingSchema = z
  .object({
    category: z.enum(OUTGOING_CATEGORIES),
    amountGbp: z.number().nonnegative(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/),
    // Required when the caller is admin, ignored/overridden by the
    // session's own gym when the caller is an owner — enforced in the route.
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();

export const pnlSummaryQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    gym: z.enum(GYM_NAMES).optional(),
  })
  .strict();

export const columnMappingSchema = z
  .object({
    dateColumn: z.string().min(1),
    descriptionColumn: z.string().min(1),
    amountMode: z.enum(["single", "debitCredit"]),
    amountColumn: z.string().optional(),
    negativeIsOutgoing: z.boolean().optional(),
    debitColumn: z.string().optional(),
    referenceColumn: z.string().optional(),
  })
  .strict()
  .refine((m) => (m.amountMode === "single" ? Boolean(m.amountColumn) : Boolean(m.debitColumn)), {
    message: "Missing amount column mapping.",
  });

export const parseBankCsvSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    csv: z.string().min(1).max(5_000_000, "CSV is too large."),
    mapping: columnMappingSchema,
  })
  .strict();

export const bankTransactionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().max(500),
    amountGbp: z.number().positive(),
    category: z.enum(OUTGOING_CATEGORIES),
  })
  .strict();

export const confirmBankCsvSchema = z
  .object({
    gym: z.enum(GYM_NAMES).optional(),
    transactions: z.array(bankTransactionSchema).min(1).max(2000),
  })
  .strict();
