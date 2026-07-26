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

export interface DashboardSummary {
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  sameMonthLastYearRevenue: number;
  monthOverMonthPercent: number | null;
  yearOverYearPercent: number | null;
  transactionCount: number;
  activeMemberCount: number;
  averageRevenuePerMember: number | null;
  /** Sorted descending by total. Admin only — null for an owner's single-gym view. */
  revenueByGym: GymRevenue[] | null;
  /** Gyms down more than 10% month-on-month. Admin only. */
  gymsDownAlert: DashboardAlert[] | null;
}

function shiftMonth(month: string, deltaMonths: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

async function sumRevenue(gym: GymName | null, month: string): Promise<number> {
  const admin = createAdminClient();
  const base = admin.from("Revenue").select("amount_inc_tax").eq("report_month", month);
  const query = gym ? base.eq("gym", gym) : base;

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as { amount_inc_tax: number }[]).reduce(
    (sum, row) => sum + Number(row.amount_inc_tax),
    0
  );
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

async function getRevenueByGym(month: string): Promise<GymRevenue[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("Revenue")
    .select("gym, amount_inc_tax")
    .eq("report_month", month);
  if (error) throw error;

  const totals = new Map<GymName, number>(GYM_NAMES.map((gym) => [gym, 0]));
  for (const row of (data ?? []) as { gym: GymName; amount_inc_tax: number }[]) {
    totals.set(row.gym, (totals.get(row.gym) ?? 0) + Number(row.amount_inc_tax));
  }

  return GYM_NAMES.map((gym) => ({ gym, total: totals.get(gym) ?? 0 })).sort(
    (a, b) => b.total - a.total
  );
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

  if (scope.role === "admin") {
    const [currentByGym, previousByGym] = await Promise.all([
      getRevenueByGym(month),
      getRevenueByGym(previousMonth),
    ]);
    revenueByGym = currentByGym;

    const previousByGymMap = new Map(previousByGym.map((row) => [row.gym, row.total]));
    gymsDownAlert = currentByGym.reduce<DashboardAlert[]>((alerts, row) => {
      const previousTotal = previousByGymMap.get(row.gym) ?? 0;
      const change = percentChange(row.total, previousTotal);
      if (change !== null && change <= -10) {
        alerts.push({ gym: row.gym, total: row.total, previousTotal, percentChange: change });
      }
      return alerts;
    }, []);
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
  };
}
