import "server-only";
import { z } from "zod";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import type { GymScope } from "@/lib/auth/gym-scope";
import { getDashboardSummary, getDefaultReportMonth } from "@/lib/data/dashboard";
import { getRevenueSummaryForRange } from "@/lib/data/revenue";
import { getPnlSummary } from "@/lib/data/outgoings";
import {
  getAtRiskMembers,
  getMemberInsightsSummary,
  getCustomerDirectory,
  getCustomerProfile,
} from "@/lib/data/members";
import { getMarketingSummary, getRecentLeads } from "@/lib/data/marketing";
import { MARKETING_PLAYBOOK } from "./marketing-playbook";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

/**
 * Resolved once per request, server-side, from the verified session (plus
 * an admin's optional gym filter on the *request itself*, validated
 * against GYM_NAMES) — never from a tool call's model-supplied input. No
 * tool's input schema below exposes a `gym` field at all, so there is no
 * argument for a prompt-injected instruction to override: this is the only
 * place a tool executor is allowed to read the target gym from. This is
 * what evals/assist-security.eval.ts asserts against.
 */
export interface AssistContext {
  scope: GymScope;
  effectiveGym: GymName | null;
}

export function resolveAssistContext(scope: GymScope, requestedGym?: string | null): AssistContext {
  if (scope.role === "owner") return { scope, effectiveGym: scope.gym };

  const isValidGym = (value: string): value is GymName => (GYM_NAMES as readonly string[]).includes(value);
  const gym = requestedGym && isValidGym(requestedGym) ? requestedGym : null;
  return { scope, effectiveGym: gym };
}

/** Surfaced to the model as a tool_result error so it can explain the limitation, not a route-level 500. */
export class AssistToolError extends Error {}

function requireSingleGym(ctx: AssistContext, toolName: string): GymName {
  if (!ctx.effectiveGym) {
    throw new AssistToolError(
      `${toolName} needs a single gym in view. Ask which gym, or explain this can't be answered for "all gyms".`
    );
  }
  return ctx.effectiveGym;
}

/** Storage/dispatch shape — deliberately erases each tool's own Input type (see defineTool) so a single array can hold every tool without `any`. */
export interface AssistTool {
  name: string;
  description: string;
  /** Anthropic tool `input_schema` — hand-written JSON Schema, kept in sync with each tool's zod schema by hand (no zod-to-json-schema dependency for 9 small, stable shapes). */
  inputSchema: Record<string, unknown>;
  execute: (rawInput: unknown, ctx: AssistContext) => Promise<unknown>;
}

/** Builds an AssistTool from a strongly-typed zod schema + executor, validating rawInput before it ever reaches execute. */
function defineTool<Input>(config: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  zodSchema: z.ZodType<Input>;
  execute: (input: Input, ctx: AssistContext) => Promise<unknown>;
}): AssistTool {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    execute: (rawInput, ctx) => config.execute(config.zodSchema.parse(rawInput), ctx),
  };
}

const monthArgSchema = z.object({ month: z.string().regex(MONTH_REGEX).optional() }).strict();

const revenueSummaryArgSchema = z
  .object({
    preset: z.enum(["last_month", "qtd", "last_quarter", "ytd", "full_year", "month"]),
    year: z.number().int().optional(),
    month: z.string().regex(MONTH_REGEX).optional(),
  })
  .strict();

const customerProfileArgSchema = z.object({ name: z.string().min(1) }).strict();

const noArgsSchema = z.object({}).strict();

const dashboardSummaryTool = defineTool({
  name: "get_dashboard_summary",
  description:
    "Headline numbers for a month: revenue, month-over-month and year-over-year change, transaction count, active members, revenue per member. Defaults to the last completed month — the data pipeline never has current-month data.",
  inputSchema: {
    type: "object",
    properties: { month: { type: "string", description: "yyyy-MM, defaults to the last completed month" } },
  },
  zodSchema: monthArgSchema,
  execute: async (input, ctx) => getDashboardSummary(ctx.scope, input.month ?? getDefaultReportMonth()),
});

const revenueSummaryTool = defineTool({
  name: "get_revenue_summary",
  description:
    "Revenue for a date-range preset, with category breakdown (memberships vs. PAYG/packs), top products, top customers, and comparison to the same period last year. Presets: last_month, qtd, last_quarter, ytd, full_year, or a specific month.",
  inputSchema: {
    type: "object",
    properties: {
      preset: {
        type: "string",
        enum: ["last_month", "qtd", "last_quarter", "ytd", "full_year", "month"],
      },
      year: { type: "number", description: "Only used with preset=full_year" },
      month: { type: "string", description: "yyyy-MM, only used with preset=month" },
    },
    required: ["preset"],
  },
  zodSchema: revenueSummaryArgSchema,
  execute: async (input, ctx) => getRevenueSummaryForRange(ctx.effectiveGym, input.preset, input.year, input.month),
});

const pnlSummaryTool = defineTool({
  name: "get_pnl_summary",
  description:
    "Profit & loss for a month: revenue, other income, outgoings by category, ad spend, and net. Defaults to the last completed month.",
  inputSchema: {
    type: "object",
    properties: { month: { type: "string", description: "yyyy-MM, defaults to the last completed month" } },
  },
  zodSchema: monthArgSchema,
  execute: async (input, ctx) => getPnlSummary(ctx.scope, ctx.effectiveGym, input.month ?? getDefaultReportMonth()),
});

const atRiskMembersTool = defineTool({
  name: "get_at_risk_members",
  description:
    "Members who haven't visited in 90+ days but were active within the last 12 months — the retention/churn-risk list, sorted most-recoverable-first. Defaults to the last completed month.",
  inputSchema: {
    type: "object",
    properties: { month: { type: "string", description: "yyyy-MM, defaults to the last completed month" } },
  },
  zodSchema: monthArgSchema,
  execute: async (input, ctx) => getAtRiskMembers(ctx.effectiveGym, input.month ?? getDefaultReportMonth()),
});

const memberInsightsSummaryTool = defineTool({
  name: "get_member_insights_summary",
  description:
    "Member engagement for a month: active member count, average attendance per active member, at-risk members, top attenders. Use this for attendance/engagement questions — it is not the same thing as revenue.",
  inputSchema: {
    type: "object",
    properties: { month: { type: "string", description: "yyyy-MM, defaults to the last completed month" } },
  },
  zodSchema: monthArgSchema,
  execute: async (input, ctx) => getMemberInsightsSummary(ctx.effectiveGym, input.month ?? getDefaultReportMonth()),
});

const topCustomersTool = defineTool({
  name: "get_top_customers",
  description: "The top 10 customers by lifetime value (all-time spend, active months, average monthly spend).",
  inputSchema: { type: "object", properties: {} },
  zodSchema: noArgsSchema,
  execute: async (_input, ctx) => {
    const customers = await getCustomerDirectory(ctx.effectiveGym);
    return [...customers].sort((a, b) => b.ltv - a.ltv).slice(0, 10);
  },
});

const customerProfileTool = defineTool({
  name: "get_customer_profile",
  description:
    "Full purchase and attendance history for one named customer: lifetime value, transactions, attendance record. Requires a single gym in view — cannot look up a customer across all gyms.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string", description: "Customer name exactly as it appears in GymFlow" } },
    required: ["name"],
  },
  zodSchema: customerProfileArgSchema,
  execute: async (input, ctx) => getCustomerProfile(requireSingleGym(ctx, "get_customer_profile"), input.name),
});

const marketingSummaryTool = defineTool({
  name: "get_marketing_summary",
  description:
    "Ad spend performance: total spend, clicks, leads, CPC, cost per lead, LTV-to-CAC. Use this for marketing/lead-generation questions.",
  inputSchema: { type: "object", properties: {} },
  zodSchema: noArgsSchema,
  execute: async (_input, ctx) => getMarketingSummary(ctx.effectiveGym),
});

const recentLeadsTool = defineTool({
  name: "get_recent_leads",
  description:
    "The most recent leads and their status (new, contacted, trial). Requires a single gym in view — cannot list leads across all gyms.",
  inputSchema: { type: "object", properties: {} },
  zodSchema: noArgsSchema,
  execute: async (_input, ctx) => getRecentLeads(requireSingleGym(ctx, "get_recent_leads")),
});

const marketingPlaybookTool = defineTool({
  name: "get_marketing_playbook",
  description:
    "Curated, ranked marketing tactics (Must Do vs. Avoid), the CAC2 metric concept, illustrative budget splits, and a 90-day rollout shape — from a one-off internal research pass, not this gym's own ad-spend data. Use alongside get_marketing_summary when a question is about *improving* marketing, not just reporting current performance. This is fixed reference material, not live-searched, and is the same for every gym.",
  inputSchema: { type: "object", properties: {} },
  zodSchema: noArgsSchema,
  execute: async () => MARKETING_PLAYBOOK,
});

export const ASSIST_TOOLS: AssistTool[] = [
  dashboardSummaryTool,
  revenueSummaryTool,
  pnlSummaryTool,
  atRiskMembersTool,
  memberInsightsSummaryTool,
  topCustomersTool,
  customerProfileTool,
  marketingSummaryTool,
  recentLeadsTool,
  marketingPlaybookTool,
];

export function getAssistTool(name: string): AssistTool | undefined {
  return ASSIST_TOOLS.find((tool) => tool.name === name);
}

export async function executeAssistTool(name: string, rawInput: unknown, ctx: AssistContext): Promise<unknown> {
  const tool = getAssistTool(name);
  if (!tool) throw new AssistToolError(`Unknown tool: ${name}`);
  return tool.execute(rawInput, ctx);
}
