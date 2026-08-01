import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GYM_NAMES, OUTGOING_CATEGORIES, type GymName, type OutgoingCategory } from "./types";
import type { GymScope } from "@/lib/auth/gym-scope";
import { getRevenueByGym, sumRevenue, getDefaultReportMonth } from "./dashboard";

export interface OutgoingEntry {
  id: number;
  category: OutgoingCategory;
  amountGbp: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface CategoryAmount {
  category: OutgoingCategory;
  amountGbp: number;
}

export interface PnlTotals {
  revenue: number;
  outgoings: number;
  categoryBreakdown: CategoryAmount[];
  adSpend: number;
  net: number;
}

export interface PnlFigures extends PnlTotals {
  gym: GymName;
}

export interface PnlSummary {
  month: string;
  /** Single gym in view — an owner always, or an admin with a gym filter. */
  single: PnlFigures | null;
  /** Admin viewing all gyms — per-gym rows plus a franchise-wide consolidated total. */
  allGyms: { perGym: PnlFigures[]; consolidated: PnlTotals } | null;
}

/**
 * All rows for a gym — a plain query, not the paginated `.range()` loop
 * used for Revenue/attendance: this is a tiny app-managed table (at most
 * dozens of rows per gym over years), nowhere near the 1000-row PostgREST
 * cap that pagination rule exists for.
 */
async function fetchOutgoingsRows(gym: GymName): Promise<
  { id: number; category: OutgoingCategory; amount_gbp: number; effective_from: string; created_at: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_outgoings")
    .select("id, category, amount_gbp, effective_from, created_at")
    .eq("gym", gym)
    .order("effective_from", { ascending: false });
  if (error) throw error;

  return (data ?? []) as {
    id: number;
    category: OutgoingCategory;
    amount_gbp: number;
    effective_from: string;
    created_at: string;
  }[];
}

/**
 * For each category, the most recent row with effective_from <= month is
 * that month's effective amount — "changing" a value means inserting a new
 * row with a later effective_from, not editing the old one, so history is
 * never lost. A category with no row yet contributes £0 (normal onboarding
 * state, not a data gap worth flagging). Split out from getCategoryBreakdown
 * so getOutgoingsMonthlyHistory can reuse it against one already-fetched
 * row set instead of re-querying per month.
 */
function computeCategoryBreakdown(
  rows: { category: OutgoingCategory; amount_gbp: number; effective_from: string }[],
  month: string
): CategoryAmount[] {
  const latestByCategory = new Map<OutgoingCategory, { amount_gbp: number; effective_from: string }>();

  for (const row of rows) {
    if (row.effective_from > month) continue;
    const existing = latestByCategory.get(row.category);
    if (!existing || row.effective_from > existing.effective_from) {
      latestByCategory.set(row.category, row);
    }
  }

  return OUTGOING_CATEGORIES.map((category) => ({
    category,
    amountGbp: Number(latestByCategory.get(category)?.amount_gbp ?? 0),
  }));
}

async function getCategoryBreakdown(gym: GymName, month: string): Promise<CategoryAmount[]> {
  const rows = await fetchOutgoingsRows(gym);
  return computeCategoryBreakdown(rows, month);
}

export interface MonthlyOutgoingsTotal {
  month: string;
  totalGbp: number;
}

/**
 * Total outgoings (summed across every category, using the same
 * most-recent-row-at-or-before-month logic as the P&L figures) for each of
 * the last `monthsBack` months up to and including the latest completed
 * month — the history trend chart on the Outgoings page. One row fetch,
 * not one query per month.
 */
export async function getOutgoingsMonthlyHistory(gym: GymName, monthsBack = 12): Promise<MonthlyOutgoingsTotal[]> {
  const rows = await fetchOutgoingsRows(gym);
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

/**
 * Scoped to `gym` as well as `id` — a belt-and-braces check alongside the
 * route's own gym-lock, so a delete can never affect a row outside the
 * caller's own gym even if the id itself were guessable/wrong.
 * Returns false if no row matched (already deleted, or wrong gym).
 */
export async function deleteOutgoing(id: number, gym: GymName): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("gym_outgoings").delete().eq("id", id).eq("gym", gym).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function insertOutgoing(
  gym: GymName,
  category: OutgoingCategory,
  amountGbp: number,
  effectiveFrom: string,
  createdBy: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("gym_outgoings").insert({
    gym,
    category,
    amount_gbp: amountGbp,
    effective_from: effectiveFrom,
    created_by: createdBy,
  });
  if (error) throw error;
}

/**
 * One row per category+month, each summing every matching transaction in
 * that bucket — gym_outgoings is a monthly-total table (see insertOutgoing
 * above), not a transaction ledger, so a bank statement's many rows collapse
 * into however many category/month combinations it actually touched. Same
 * append-only convention as insertOutgoing: no upsert, history is never
 * overwritten.
 */
export async function insertOutgoingsBatch(
  gym: GymName,
  entries: { category: OutgoingCategory; amountGbp: number; effectiveFrom: string }[],
  createdBy: string
): Promise<number> {
  const admin = createAdminClient();
  const rows = entries.map((e) => ({
    gym,
    category: e.category,
    amount_gbp: e.amountGbp,
    effective_from: e.effectiveFrom,
    created_by: createdBy,
  }));
  const { error } = await admin.from("gym_outgoings").insert(rows);
  if (error) throw error;
  return rows.length;
}

export interface OutgoingTransaction {
  id: number;
  date: string;
  description: string;
  amountGbp: number;
  category: OutgoingCategory;
  createdAt: string;
}

/**
 * Per-transaction detail behind a bank-statement import (see
 * gym_outgoing_transactions, migration 0007) — who/what an outgoing
 * actually was, e.g. "HMRC" or a named one-off payment, which the
 * category+month total in gym_outgoings alone can't show. Purely a
 * drill-down log; never read by the P&L calculation.
 */
export async function insertOutgoingTransactions(
  gym: GymName,
  transactions: { date: string; description: string; amountGbp: number; category: OutgoingCategory }[],
  createdBy: string
): Promise<void> {
  const admin = createAdminClient();
  const rows = transactions.map((t) => ({
    gym,
    transaction_date: t.date,
    description: t.description,
    amount_gbp: t.amountGbp,
    category: t.category,
    created_by: createdBy,
  }));
  const { error } = await admin.from("gym_outgoing_transactions").insert(rows);
  if (error) throw error;
}

export async function getOutgoingTransactions(gym: GymName, limit = 200): Promise<OutgoingTransaction[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_outgoing_transactions")
    .select("id, transaction_date, description, amount_gbp, category, created_at")
    .eq("gym", gym)
    .order("transaction_date", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as number,
    date: row.transaction_date as string,
    description: row.description as string,
    amountGbp: Number(row.amount_gbp),
    category: row.category as OutgoingCategory,
    createdAt: row.created_at as string,
  }));
}

export async function getOutgoingsHistory(gym: GymName): Promise<OutgoingEntry[]> {
  const rows = await fetchOutgoingsRows(gym);
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    amountGbp: Number(row.amount_gbp),
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
  }));
}

/**
 * Marketing spend for the month, from `ad_spend` (Stage 8) — summed by
 * whichever ISO week's `week_starting` falls inside the calendar month.
 * Returns 0 today since Stage 8 hasn't shipped and the table is empty, but
 * wiring the real query now avoids reworking the P&L calc later.
 */
async function sumAdSpend(gym: GymName, month: string): Promise<number> {
  const [year, mon] = month.split("-").map(Number);
  const monthStart = `${year}-${String(mon).padStart(2, "0")}-01`;
  const monthEnd = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_spend")
    .select("spend_gbp")
    .eq("gym", gym)
    .gte("week_starting", monthStart)
    .lt("week_starting", monthEnd);
  if (error) throw error;

  return ((data ?? []) as { spend_gbp: number }[]).reduce((sum, row) => sum + Number(row.spend_gbp), 0);
}

async function getPnlFiguresForGym(gym: GymName, month: string, revenue: number): Promise<PnlFigures> {
  const [categoryBreakdown, adSpend] = await Promise.all([getCategoryBreakdown(gym, month), sumAdSpend(gym, month)]);
  const outgoings = categoryBreakdown.reduce((sum, c) => sum + c.amountGbp, 0);

  return {
    gym,
    revenue,
    outgoings,
    categoryBreakdown,
    adSpend,
    net: revenue - outgoings - adSpend,
  };
}

function sumFigures(rows: PnlFigures[]): PnlTotals {
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const outgoings = rows.reduce((sum, r) => sum + r.outgoings, 0);
  const adSpend = rows.reduce((sum, r) => sum + r.adSpend, 0);
  const categoryBreakdown = OUTGOING_CATEGORIES.map((category) => ({
    category,
    amountGbp: rows.reduce(
      (sum, r) => sum + (r.categoryBreakdown.find((c) => c.category === category)?.amountGbp ?? 0),
      0
    ),
  }));

  return { revenue, outgoings, categoryBreakdown, adSpend, net: revenue - outgoings - adSpend };
}

/**
 * `scope`/`gymFilter` already security-resolved by the caller (owner
 * locked to their own gym, admin's explicit selection or null for "all
 * gyms") — see /api/outgoings/summary, same convention as
 * getMemberInsightsSummary.
 */
export async function getPnlSummary(scope: GymScope, gymFilter: GymName | null, month: string): Promise<PnlSummary> {
  if (scope.role === "owner") {
    const revenue = await sumRevenue(scope.gym, month);
    return { month, single: await getPnlFiguresForGym(scope.gym, month, revenue), allGyms: null };
  }

  if (gymFilter) {
    const revenue = await sumRevenue(gymFilter, month);
    return { month, single: await getPnlFiguresForGym(gymFilter, month, revenue), allGyms: null };
  }

  // One query for every gym's revenue rather than 9 separate sumRevenue
  // calls — getRevenueByGym already exists for exactly this shape.
  const revenueByGym = await getRevenueByGym(month);
  const revenueMap = new Map(revenueByGym.map((r) => [r.gym, r.total]));
  const perGym = await Promise.all(
    GYM_NAMES.map((gym) => getPnlFiguresForGym(gym, month, revenueMap.get(gym) ?? 0))
  );
  const consolidated = sumFigures(perGym);
  return { month, single: null, allGyms: { perGym, consolidated } };
}
