import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GYM_NAMES, type GymName } from "./types";
import type { GymScope } from "@/lib/auth/gym-scope";

export interface GymRevenue {
  gym: GymName;
  total: number;
}

export interface DashboardAlert extends GymRevenue {
  previousTotal: number;
  percentChange: number;
}

export interface GymArpm {
  gym: GymName;
  payingCustomers: number;
  /** null when the gym has zero paying customers this month (avoids a divide-by-zero, not a real £0). */
  arpm: number | null;
}

export interface DashboardSummary {
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  sameMonthLastYearRevenue: number;
  monthOverMonthPercent: number | null;
  yearOverYearPercent: number | null;
  transactionCount: number;
  activeMemberCount: number;
  /**
   * Blended across every gym in scope. For an owner this is already
   * single-gym and meaningful; for an admin it mixes gyms that price
   * differently and is weak for decisions — see arpmByGym instead.
   */
  averageRevenuePerMember: number | null;
  /** Sorted descending by total. Admin only — null for an owner's single-gym view. */
  revenueByGym: GymRevenue[] | null;
  /** Gyms down more than 10% month-on-month. Admin only. */
  gymsDownAlert: DashboardAlert[] | null;
  /** Per-gym revenue-per-member, sorted descending (nulls last). Admin only. */
  arpmByGym: GymArpm[] | null;
  /**
   * Gyms with zero attendance rows this month — not a real "no active
   * members", a data-completeness gap. Surfacing this so activeMemberCount
   * isn't silently understated without explanation. Admin only.
   */
  gymsWithNoAttendanceData: GymName[] | null;
}

export function shiftMonth(month: string, deltaMonths: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The data pipeline (UiPath) only ever backfills the prior completed
 * month — the current calendar month is always empty by design, not a
 * gap to work around. Dashboards default here, not to "this month".
 */
export function getDefaultReportMonth(): string {
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return shiftMonth(thisMonth, -1);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Supabase/PostgREST caps a single request at 1000 rows and truncates
// silently past that — no error, just fewer rows than actually match. A
// single month of one gym's Revenue is small, but all-gyms-combined is
// already ~926 rows/month (confirmed truncating for any multi-month
// range — see src/lib/data/revenue.ts) and will keep growing, so every
// raw-row Revenue/attendance fetch here pages through .range() rather
// than assuming one request returns everything.
const PAGE_SIZE = 1000;

export async function sumRevenue(gym: GymName | null, month: string): Promise<number> {
  const admin = createAdminClient();
  let total = 0;
  let from = 0;

  for (;;) {
    const base = admin
      .from("Revenue")
      .select("amount_inc_tax")
      .eq("report_month", month)
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

async function countTransactions(gym: GymName | null, month: string): Promise<number> {
  const admin = createAdminClient();
  const base = admin
    .from("Revenue")
    .select("*", { count: "exact", head: true })
    .eq("report_month", month);
  const query = gym ? base.eq("gym", gym) : base;

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function countActiveMembers(gym: GymName | null, month: string): Promise<number> {
  const admin = createAdminClient();
  const base = admin
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("report_month", month)
    .gt("attendance", 0);
  const query = gym ? base.eq("gym", gym) : base;

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getRevenueByGym(month: string): Promise<GymRevenue[]> {
  const admin = createAdminClient();
  const totals = new Map<GymName, number>(GYM_NAMES.map((gym) => [gym, 0]));
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("Revenue")
      .select("gym, amount_inc_tax")
      .eq("report_month", month)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as { gym: GymName; amount_inc_tax: number }[];
    for (const row of rows) {
      totals.set(row.gym, (totals.get(row.gym) ?? 0) + Number(row.amount_inc_tax));
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return GYM_NAMES.map((gym) => ({ gym, total: totals.get(gym) ?? 0 })).sort(
    (a, b) => b.total - a.total
  );
}

/**
 * Distinct paying customers per gym this month, from Revenue.sold_to —
 * used as the ARPM denominator instead of attendance-derived active
 * members, since attendance can lag or be missing for a gym/month while
 * Revenue still has real transactions for the same people.
 */
async function getPayingCustomersByGym(month: string): Promise<Map<GymName, number>> {
  const admin = createAdminClient();
  const customersByGym = new Map<GymName, Set<string>>(GYM_NAMES.map((gym) => [gym, new Set()]));
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("Revenue")
      .select("gym, sold_to")
      .eq("report_month", month)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as { gym: GymName; sold_to: string }[];
    for (const row of rows) {
      customersByGym.get(row.gym)?.add(row.sold_to);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const counts = new Map<GymName, number>();
  for (const [gym, customers] of customersByGym) counts.set(gym, customers.size);
  return counts;
}

async function getGymsWithNoAttendanceData(month: string): Promise<GymName[]> {
  const admin = createAdminClient();
  const gymsWithData = new Set<GymName>();
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("attendance")
      .select("gym")
      .eq("report_month", month)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as { gym: GymName }[];
    for (const row of rows) gymsWithData.add(row.gym);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return GYM_NAMES.filter((gym) => !gymsWithData.has(gym));
}

/** Last `months` totals ending at (and including) `endingMonth`, oldest first — for sparklines/trend charts. */
export async function getRevenueTrend(
  gym: GymName | null,
  months: number,
  endingMonth: string
): Promise<{ month: string; total: number }[]> {
  const monthList = Array.from({ length: months }, (_, i) => shiftMonth(endingMonth, -(months - 1 - i)));
  const totals = await Promise.all(monthList.map((month) => sumRevenue(gym, month)));
  return monthList.map((month, i) => ({ month, total: totals[i] }));
}

export async function getDashboardSummary(scope: GymScope, month: string): Promise<DashboardSummary> {
  const gym = scope.role === "admin" ? null : scope.gym;
  const previousMonth = shiftMonth(month, -1);
  const lastYearMonth = shiftMonth(month, -12);

  const [currentMonthRevenue, previousMonthRevenue, sameMonthLastYearRevenue, transactionCount, activeMemberCount] =
    await Promise.all([
      sumRevenue(gym, month),
      sumRevenue(gym, previousMonth),
      sumRevenue(gym, lastYearMonth),
      countTransactions(gym, month),
      countActiveMembers(gym, month),
    ]);

  let revenueByGym: GymRevenue[] | null = null;
  let gymsDownAlert: DashboardAlert[] | null = null;
  let arpmByGym: GymArpm[] | null = null;
  let gymsWithNoAttendanceData: GymName[] | null = null;

  if (scope.role === "admin") {
    const [currentByGym, previousByGym, payingCustomersByGym, noAttendanceGyms] = await Promise.all([
      getRevenueByGym(month),
      getRevenueByGym(previousMonth),
      getPayingCustomersByGym(month),
      getGymsWithNoAttendanceData(month),
    ]);
    revenueByGym = currentByGym;
    gymsWithNoAttendanceData = noAttendanceGyms;

    const previousByGymMap = new Map(previousByGym.map((row) => [row.gym, row.total]));
    gymsDownAlert = currentByGym.reduce<DashboardAlert[]>((alerts, row) => {
      const previousTotal = previousByGymMap.get(row.gym) ?? 0;
      const change = percentChange(row.total, previousTotal);
      if (change !== null && change <= -10) {
        alerts.push({ gym: row.gym, total: row.total, previousTotal, percentChange: change });
      }
      return alerts;
    }, []);

    arpmByGym = currentByGym
      .map((row) => {
        const payingCustomers = payingCustomersByGym.get(row.gym) ?? 0;
        return {
          gym: row.gym,
          payingCustomers,
          arpm: payingCustomers > 0 ? row.total / payingCustomers : null,
        };
      })
      .sort((a, b) => (b.arpm ?? -1) - (a.arpm ?? -1));
  }

  return {
    currentMonthRevenue,
    previousMonthRevenue,
    sameMonthLastYearRevenue,
    monthOverMonthPercent: percentChange(currentMonthRevenue, previousMonthRevenue),
    yearOverYearPercent: percentChange(currentMonthRevenue, sameMonthLastYearRevenue),
    transactionCount,
    activeMemberCount,
    averageRevenuePerMember: activeMemberCount > 0 ? currentMonthRevenue / activeMemberCount : null,
    revenueByGym,
    gymsDownAlert,
    arpmByGym,
    gymsWithNoAttendanceData,
  };
}
