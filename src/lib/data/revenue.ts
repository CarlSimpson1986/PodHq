import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";
import { getDefaultReportMonth, shiftMonth } from "./dashboard";

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

async function sumRevenueForRange(gym: GymName | null, range: MonthRange): Promise<number> {
  const admin = createAdminClient();
  let total = 0;
  let from = 0;

  for (;;) {
    const base = admin
      .from("Revenue")
      .select("amount_inc_tax")
      .gte("report_month", range.start)
      .lte("report_month", range.end)
      .range(from, from + PAGE_SIZE - 1);
    const query = gym ? base.eq("gym", gym) : base;

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as { amount_inc_tax: number }[];
    total += rows.reduce((sum, row) => sum + Number(row.amount_inc_tax), 0);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return total;
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

  const [total, sameLastYearTotal, previousPeriodTotal] = await Promise.all([
    sumRevenueForRange(gym, range),
    sumRevenueForRange(gym, sameRangeLastYear),
    previousPeriod ? sumRevenueForRange(gym, previousPeriod) : Promise.resolve(null),
  ]);

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
  };
}
