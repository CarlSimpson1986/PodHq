import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";
import { getDefaultReportMonth, getRevenueTrend, shiftMonth } from "./dashboard";

export type DateRangePreset = "last_month" | "qtd" | "last_quarter" | "ytd" | "full_year";

export interface MonthRange {
  start: string;
  end: string;
}

export interface RevenueRangeSummary {
  range: MonthRange;
  label: string;
  total: number;
  previousPeriod: { range: MonthRange; total: number; percentChange: number | null } | null;
  /** Always populated, unlike previousPeriod — "same range, 12 months back" is meaningful for every preset. */
  sameRangeLastYear: { range: MonthRange; total: number; percentChange: number | null };
  categoryBreakdown: CategoryBreakdown;
  categoryTrend: ({ month: string } & CategoryBreakdown)[];
  transactionCount: number;
  averageRevenuePerTransaction: number | null;
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  /** Fixed 12 months ending at the last completed month — independent of the selected preset/range. */
  trend: TrendPoint[];
}

function quarterStartMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const quarterStartMon = Math.floor((mon - 1) / 3) * 3 + 1;
  return `${year}-${String(quarterStartMon).padStart(2, "0")}`;
}

function monthCount(range: MonthRange): number {
  const [sy, sm] = range.start.split("-").map(Number);
  const [ey, em] = range.end.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

/**
 * All presets anchor on the last completed month (see getDefaultReportMonth),
 * never literal "today" — the pipeline never has current-month data, so e.g.
 * "QTD" means "quarter containing the last completed month, through that
 * month", not "calendar quarter to date" in the usual sense.
 */
export function resolveDateRange(preset: DateRangePreset, year?: number): { range: MonthRange; label: string } {
  const refMonth = getDefaultReportMonth();
  const refYear = Number(refMonth.slice(0, 4));

  switch (preset) {
    case "last_month":
      return { range: { start: refMonth, end: refMonth }, label: "Last month" };
    case "qtd":
      return { range: { start: quarterStartMonth(refMonth), end: refMonth }, label: "Quarter to date" };
    case "last_quarter": {
      const thisQuarterStart = quarterStartMonth(refMonth);
      const start = shiftMonth(thisQuarterStart, -3);
      const end = shiftMonth(thisQuarterStart, -1);
      return { range: { start, end }, label: "Last quarter" };
    }
    case "ytd":
      return { range: { start: `${refYear}-01`, end: refMonth }, label: "Year to date" };
    case "full_year": {
      const targetYear = year ?? refYear;
      const end = targetYear === refYear ? refMonth : `${targetYear}-12`;
      return { range: { start: `${targetYear}-01`, end }, label: `${targetYear}` };
    }
  }
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Supabase/PostgREST caps a single request at 1000 rows by default and
// truncates silently past that — no error, just fewer rows than actually
// match. A single month of all-gym Revenue is ~900 rows (safely under),
// but any multi-month range easily exceeds it, so range queries must page
// through results rather than assume one request returns everything.
const PAGE_SIZE = 1000;

/** Paginated raw-row fetch against Revenue for a month range — the shared primitive every aggregate below builds on. */
async function fetchRevenueRowsForRange<T>(
  gym: GymName | null,
  range: MonthRange,
  columns: string
): Promise<T[]> {
  const admin = createAdminClient();
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const base = admin
      .from("Revenue")
      .select(columns)
      .gte("report_month", range.start)
      .lte("report_month", range.end)
      .range(from, from + PAGE_SIZE - 1);
    const query = gym ? base.eq("gym", gym) : base;

    const { data, error } = await query;
    if (error) throw error;

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function sumRevenueForRange(gym: GymName | null, range: MonthRange): Promise<number> {
  const rows = await fetchRevenueRowsForRange<{ amount_inc_tax: number }>(gym, range, "amount_inc_tax");
  return rows.reduce((sum, row) => sum + Number(row.amount_inc_tax), 0);
}

async function countTransactionsForRange(gym: GymName | null, range: MonthRange): Promise<number> {
  const admin = createAdminClient();
  const base = admin
    .from("Revenue")
    .select("*", { count: "exact", head: true })
    .gte("report_month", range.start)
    .lte("report_month", range.end);
  const query = gym ? base.eq("gym", gym) : base;

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export interface CategoryBreakdown {
  membership: number;
  creditPack: number;
}

async function getCategoryBreakdown(gym: GymName | null, range: MonthRange): Promise<CategoryBreakdown> {
  const rows = await fetchRevenueRowsForRange<{ category: "MEMBERSHIP" | "CREDIT_PACK"; amount_inc_tax: number }>(
    gym,
    range,
    "category, amount_inc_tax"
  );
  let membership = 0;
  let creditPack = 0;
  for (const row of rows) {
    if (row.category === "MEMBERSHIP") membership += Number(row.amount_inc_tax);
    else creditPack += Number(row.amount_inc_tax);
  }
  return { membership, creditPack };
}

/** Last `months` category splits ending at `endingMonth`, oldest first — for the category-over-time stacked area. */
async function getCategoryTrend(
  gym: GymName | null,
  months: number,
  endingMonth: string
): Promise<({ month: string } & CategoryBreakdown)[]> {
  const monthList = Array.from({ length: months }, (_, i) => shiftMonth(endingMonth, -(months - 1 - i)));
  const breakdowns = await Promise.all(monthList.map((month) => getCategoryBreakdown(gym, { start: month, end: month })));
  return monthList.map((month, i) => ({ month, ...breakdowns[i] }));
}

export interface TopProduct {
  item: string;
  total: number;
}

async function getTopProducts(gym: GymName | null, range: MonthRange, limit: number): Promise<TopProduct[]> {
  const rows = await fetchRevenueRowsForRange<{ item: string; amount_inc_tax: number }>(
    gym,
    range,
    "item, amount_inc_tax"
  );
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.item, (totals.get(row.item) ?? 0) + Number(row.amount_inc_tax));
  }
  return [...totals.entries()]
    .map(([item, total]) => ({ item, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export interface TopCustomer {
  name: string;
  gym: GymName;
  total: number;
  percentOfTotal: number;
  /** Most recent report_month with a purchase within the selected range — a
   *  top-10 spot can come from one big early purchase with nothing since. */
  lastPurchaseMonth: string;
}

async function getTopCustomers(gym: GymName | null, range: MonthRange, limit: number): Promise<TopCustomer[]> {
  const rows = await fetchRevenueRowsForRange<{
    gym: GymName;
    sold_to: string;
    amount_inc_tax: number;
    report_month: string;
  }>(gym, range, "gym, sold_to, amount_inc_tax, report_month");
  // Keyed by gym::sold_to (matching the LTV convention in lib/data/members.ts),
  // not sold_to alone — two different customers can share a name across
  // different gyms, and in the admin "All gyms" view that would otherwise
  // wrongly merge them into one row.
  const totals = new Map<string, { gym: GymName; name: string; total: number }>();
  const lastPurchaseMonth = new Map<string, string>();
  let grandTotal = 0;
  for (const row of rows) {
    const key = `${row.gym}::${row.sold_to}`;
    const amount = Number(row.amount_inc_tax);
    const entry = totals.get(key) ?? { gym: row.gym, name: row.sold_to, total: 0 };
    entry.total += amount;
    totals.set(key, entry);
    grandTotal += amount;
    const prevLast = lastPurchaseMonth.get(key);
    // report_month is "yyyy-MM" — lexicographic comparison is chronological.
    if (!prevLast || row.report_month > prevLast) lastPurchaseMonth.set(key, row.report_month);
  }
  return [...totals.entries()]
    .map(([key, { gym, name, total }]) => ({
      name,
      gym,
      total,
      percentOfTotal: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      lastPurchaseMonth: lastPurchaseMonth.get(key) ?? range.end,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export interface TrendPoint {
  month: string;
  current: number;
  priorYear: number;
}

/** Fixed 12-month trend ending at the last completed month, with a same-months-prior-year overlay — independent of the date-range preset. */
async function getRevenueTrendWithYoy(gym: GymName | null, months: number, endingMonth: string): Promise<TrendPoint[]> {
  const [current, priorYear] = await Promise.all([
    getRevenueTrend(gym, months, endingMonth),
    getRevenueTrend(gym, months, shiftMonth(endingMonth, -12)),
  ]);
  return current.map((row, i) => ({ month: row.month, current: row.total, priorYear: priorYear[i].total }));
}

/**
 * `gym` must already be security-resolved by the caller: an owner's own
 * gym always, regardless of what a client asked for; an admin's explicit
 * selection (validated against GYM_NAMES) or null for "all gyms". This
 * function doesn't know or check roles — see /api/revenue/summary.
 */
export async function getRevenueSummaryForRange(
  gym: GymName | null,
  preset: DateRangePreset,
  year?: number
): Promise<RevenueRangeSummary> {
  const { range, label } = resolveDateRange(preset, year);

  const sameRangeLastYear: MonthRange = {
    start: shiftMonth(range.start, -12),
    end: shiftMonth(range.end, -12),
  };

  // A same-length immediately-prior period is only meaningful for
  // fixed-length recent presets — YTD/full-year don't have an obvious
  // "previous period" of the same shape, so we skip it for those.
  const previousPeriod: MonthRange | null =
    preset === "last_month" || preset === "qtd" || preset === "last_quarter"
      ? { start: shiftMonth(range.start, -monthCount(range)), end: shiftMonth(range.end, -monthCount(range)) }
      : null;

  const refMonth = getDefaultReportMonth();

  // categoryBreakdown covers the same range as `total`, so total is derived
  // from it rather than fetched a second time.
  const [
    categoryBreakdown,
    sameLastYearTotal,
    previousPeriodTotal,
    categoryTrend,
    topProducts,
    topCustomers,
    trend,
    transactionCount,
  ] = await Promise.all([
    getCategoryBreakdown(gym, range),
    sumRevenueForRange(gym, sameRangeLastYear),
    previousPeriod ? sumRevenueForRange(gym, previousPeriod) : Promise.resolve(null),
    getCategoryTrend(gym, 12, refMonth),
    getTopProducts(gym, range, 10),
    getTopCustomers(gym, range, 10),
    getRevenueTrendWithYoy(gym, 12, refMonth),
    countTransactionsForRange(gym, range),
  ]);

  const total = categoryBreakdown.membership + categoryBreakdown.creditPack;

  return {
    range,
    label,
    total,
    previousPeriod:
      previousPeriod && previousPeriodTotal !== null
        ? { range: previousPeriod, total: previousPeriodTotal, percentChange: percentChange(total, previousPeriodTotal) }
        : null,
    sameRangeLastYear: {
      range: sameRangeLastYear,
      total: sameLastYearTotal,
      percentChange: percentChange(total, sameLastYearTotal),
    },
    categoryBreakdown,
    categoryTrend,
    transactionCount,
    averageRevenuePerTransaction: transactionCount > 0 ? total / transactionCount : null,
    topProducts,
    topCustomers,
    trend,
  };
}
