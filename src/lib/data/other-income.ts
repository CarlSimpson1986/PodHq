import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OTHER_INCOME_CATEGORIES,
  RECURRING_INCOME_CATEGORIES,
  type GymName,
  type OtherIncomeCategory,
} from "./types";
import { getDefaultReportMonth } from "./dashboard";
import type { MonthRange } from "./revenue";

export interface OtherIncomeEntry {
  id: number;
  category: OtherIncomeCategory;
  label: string | null;
  amountGbp: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface OtherIncomeCategoryAmount {
  category: OtherIncomeCategory;
  amountGbp: number;
}

/**
 * All rows for a gym — a plain query, not the paginated `.range()` loop
 * used for Revenue/attendance: this is a tiny app-managed table, nowhere
 * near the 1000-row PostgREST cap that pagination rule exists for.
 */
async function fetchOtherIncomeRows(gym: GymName): Promise<
  {
    id: number;
    category: OtherIncomeCategory;
    label: string | null;
    amount_gbp: number;
    effective_from: string;
    created_at: string;
  }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_other_income")
    .select("id, category, label, amount_gbp, effective_from, created_at")
    .eq("gym", gym)
    .order("effective_from", { ascending: false });
  if (error) throw error;

  return (data ?? []) as {
    id: number;
    category: OtherIncomeCategory;
    label: string | null;
    amount_gbp: number;
    effective_from: string;
    created_at: string;
  }[];
}

/**
 * Recurring categories (see RECURRING_INCOME_CATEGORIES) carry forward like
 * gym_outgoings — the most recent row at or before `month` is that month's
 * effective amount. One-off categories only count a row whose
 * effective_from is exactly `month`: carrying a variable income figure
 * forward would silently overstate a quiet month. A category with no
 * qualifying row contributes £0, same as outgoings' onboarding state.
 */
function computeCategoryBreakdown(
  rows: { category: OtherIncomeCategory; amount_gbp: number; effective_from: string }[],
  month: string
): OtherIncomeCategoryAmount[] {
  const latestByCategory = new Map<OtherIncomeCategory, { amount_gbp: number; effective_from: string }>();

  for (const row of rows) {
    if (row.effective_from > month) continue;
    if (!RECURRING_INCOME_CATEGORIES.has(row.category) && row.effective_from !== month) continue;
    const existing = latestByCategory.get(row.category);
    if (!existing || row.effective_from > existing.effective_from) {
      latestByCategory.set(row.category, row);
    }
  }

  return OTHER_INCOME_CATEGORIES.map((category) => ({
    category,
    amountGbp: Number(latestByCategory.get(category)?.amount_gbp ?? 0),
  }));
}

export async function getOtherIncomeCategoryBreakdown(gym: GymName, month: string): Promise<OtherIncomeCategoryAmount[]> {
  const rows = await fetchOtherIncomeRows(gym);
  return computeCategoryBreakdown(rows, month);
}

function monthsBetween(range: MonthRange): string[] {
  const [startYear, startMon] = range.start.split("-").map(Number);
  const [endYear, endMon] = range.end.split("-").map(Number);
  const count = (endYear - startYear) * 12 + (endMon - startMon) + 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(startYear, startMon - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Sums each month's resolved category breakdown across the range — mirrors
 * outgoings' computeCategoryBreakdownForRange, same reasoning: a recurring
 * category's rate applies until changed, so a multi-month total is the sum
 * of what was actually effective each month.
 */
function computeCategoryBreakdownForRange(
  rows: { category: OtherIncomeCategory; amount_gbp: number; effective_from: string }[],
  range: MonthRange
): OtherIncomeCategoryAmount[] {
  const totals = new Map<OtherIncomeCategory, number>();
  for (const month of monthsBetween(range)) {
    for (const { category, amountGbp } of computeCategoryBreakdown(rows, month)) {
      totals.set(category, (totals.get(category) ?? 0) + amountGbp);
    }
  }
  return OTHER_INCOME_CATEGORIES.map((category) => ({ category, amountGbp: totals.get(category) ?? 0 }));
}

export async function getOtherIncomeForRange(gym: GymName, range: MonthRange): Promise<OtherIncomeCategoryAmount[]> {
  const rows = await fetchOtherIncomeRows(gym);
  return computeCategoryBreakdownForRange(rows, range);
}

export async function sumOtherIncome(gym: GymName, month: string): Promise<number> {
  const breakdown = await getOtherIncomeCategoryBreakdown(gym, month);
  return breakdown.reduce((sum, c) => sum + c.amountGbp, 0);
}

export async function sumOtherIncomeForRange(gym: GymName, range: MonthRange): Promise<number> {
  const breakdown = await getOtherIncomeForRange(gym, range);
  return breakdown.reduce((sum, c) => sum + c.amountGbp, 0);
}

export interface MonthlyOtherIncomeTotal {
  month: string;
  totalGbp: number;
}

/**
 * Total other income for each of the last `monthsBack` months up to the
 * latest completed month — mirrors getOutgoingsMonthlyHistory. One row
 * fetch, not one query per month.
 */
export async function getOtherIncomeMonthlyHistory(gym: GymName, monthsBack = 12): Promise<MonthlyOtherIncomeTotal[]> {
  const rows = await fetchOtherIncomeRows(gym);
  const endMonth = getDefaultReportMonth();
  const [endYear, endMon] = endMonth.split("-").map(Number);

  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(endYear, endMon - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return months.map((month) => {
    const breakdown = computeCategoryBreakdown(rows, month);
    return { month, totalGbp: breakdown.reduce((sum, c) => sum + c.amountGbp, 0) };
  });
}

export async function getOtherIncomeHistory(gym: GymName): Promise<OtherIncomeEntry[]> {
  const rows = await fetchOtherIncomeRows(gym);
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    label: row.label,
    amountGbp: Number(row.amount_gbp),
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
  }));
}

export async function insertOtherIncome(
  gym: GymName,
  category: OtherIncomeCategory,
  amountGbp: number,
  effectiveFrom: string,
  createdBy: string,
  label?: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("gym_other_income").insert({
    gym,
    category,
    label: label || null,
    amount_gbp: amountGbp,
    effective_from: effectiveFrom,
    created_by: createdBy,
  });
  if (error) throw error;
}

/**
 * Scoped to `gym` as well as `id` — a belt-and-braces check alongside the
 * route's own gym-lock, same reasoning as deleteOutgoing.
 */
export async function deleteOtherIncome(id: number, gym: GymName): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("gym_other_income").delete().eq("id", id).eq("gym", gym).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
