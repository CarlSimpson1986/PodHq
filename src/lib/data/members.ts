import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GYM_NAMES, type GymName } from "./types";
import { getDefaultReportMonth, shiftMonth } from "./dashboard";

const PAGE_SIZE = 1000;

export interface AttendanceMember {
  userMemberId: string;
  name: string;
  gym: GymName;
  attendance: number;
  lastAttended: string | null;
}

export interface LtvCustomer {
  name: string;
  gym: GymName;
  totalSpend: number;
  activeMonths: number;
  avgMonthlySpend: number;
  ltv: number;
  /** Most recent report_month with any Revenue row — lets a reader spot a
   *  high-LTV customer who's actually long gone (the formula has no
   *  cancellation date to know that on its own). */
  lastActiveMonth: string;
}

export interface LtvHistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
}

export interface MemberInsightsSummary {
  month: string;
  activeMemberCount: number;
  avgAttendancePerActiveMember: number | null;
  /** 1-3 visits, sorted worst-first (1 before 3). */
  atRiskMembers: AttendanceMember[];
  topAttenders: AttendanceMember[];
  /** Admin viewing all gyms only — which of the 9 gyms have zero attendance rows this month. */
  gymsWithNoAttendanceData: GymName[] | null;
  /** A single gym is in view (owner, or admin with a gym filter) and it has zero attendance rows this month. */
  noAttendanceDataForGym: boolean;
  ltv: {
    topCustomers: LtvCustomer[];
    distribution: LtvHistogramBucket[];
    averageLtv: number | null;
    affordableCac: number | null;
    customerCount: number;
  };
}

async function fetchActiveAttendanceRows(
  gym: GymName | null,
  month: string
): Promise<
  {
    gym: GymName;
    user_member_id: string;
    first_name: string;
    last_name: string;
    attendance: number;
    last_attended: string | null;
  }[]
> {
  const admin = createAdminClient();
  const rows: {
    gym: GymName;
    user_member_id: string;
    first_name: string;
    last_name: string;
    attendance: number;
    last_attended: string | null;
  }[] = [];
  let from = 0;

  for (;;) {
    const base = admin
      .from("attendance")
      .select("gym, user_member_id, first_name, last_name, attendance, last_attended")
      .eq("report_month", month)
      .gt("attendance", 0)
      .range(from, from + PAGE_SIZE - 1);
    const query = gym ? base.eq("gym", gym) : base;

    const { data, error } = await query;
    if (error) throw error;

    const page = (data ?? []) as {
      gym: GymName;
      user_member_id: string;
      first_name: string;
      last_name: string;
      attendance: number;
      last_attended: string | null;
    }[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function getAttendanceCompleteness(
  gym: GymName | null,
  month: string
): Promise<{ gymsWithNoAttendanceData: GymName[] | null; noAttendanceDataForGym: boolean }> {
  const admin = createAdminClient();

  if (gym) {
    const { count, error } = await admin
      .from("attendance")
      .select("*", { count: "exact", head: true })
      .eq("report_month", month)
      .eq("gym", gym);
    if (error) throw error;
    return { gymsWithNoAttendanceData: null, noAttendanceDataForGym: (count ?? 0) === 0 };
  }

  const gymsWithData = new Set<GymName>();
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("attendance")
      .select("gym")
      .eq("report_month", month)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as { gym: GymName }[];
    for (const row of page) gymsWithData.add(row.gym);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return {
    gymsWithNoAttendanceData: GYM_NAMES.filter((g) => !gymsWithData.has(g)),
    noAttendanceDataForGym: false,
  };
}

/**
 * All-time Revenue rows for LTV — deliberately not scoped to the selected
 * month, since lifetime value is a lifetime concept. Same full-scan
 * pagination approach as every other aggregate in this app (no caching
 * layer yet); will keep growing as history accumulates.
 */
export async function fetchAllRevenueForLtv(
  gym: GymName | null
): Promise<{ gym: GymName; sold_to: string; amount_inc_tax: number; report_month: string }[]> {
  const admin = createAdminClient();
  const rows: { gym: GymName; sold_to: string; amount_inc_tax: number; report_month: string }[] = [];
  let from = 0;

  for (;;) {
    const base = admin
      .from("Revenue")
      .select("gym, sold_to, amount_inc_tax, report_month")
      .range(from, from + PAGE_SIZE - 1);
    const query = gym ? base.eq("gym", gym) : base;

    const { data, error } = await query;
    if (error) throw error;

    const page = (data ?? []) as { gym: GymName; sold_to: string; amount_inc_tax: number; report_month: string }[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * LTV = a customer's own avg monthly spend × their gym's average customer
 * lifespan (active months) — the standard ARPU × avg-lifespan formula, not
 * a customer's own historical total: using an individual's own lifespan
 * would make the multiplication collapse straight back to their raw
 * spend-to-date, which makes "affordable CAC = LTV ÷ 3" meaningless.
 *
 * "Active months" = distinct report_months a customer has ANY Revenue row
 * in, not the calendar span between first and last purchase — someone who
 * paid Jan/Feb/Mar/May/Jun has 5 active months, not 6. We have no
 * cancellation/join dates (out of scope until the PDK migration), so a
 * still-active customer's true lifespan is always >= what's been observed
 * so far — this systematically understates both average lifespan and LTV,
 * a conservative floor, never an overstatement.
 */
export function computeLtv(
  rows: { gym: GymName; sold_to: string; amount_inc_tax: number; report_month: string }[]
): LtvCustomer[] {
  const perCustomer = new Map<
    string,
    { gym: GymName; name: string; totalSpend: number; months: Set<string>; lastActiveMonth: string }
  >();

  for (const row of rows) {
    const key = `${row.gym}::${row.sold_to}`;
    let entry = perCustomer.get(key);
    if (!entry) {
      entry = { gym: row.gym, name: row.sold_to, totalSpend: 0, months: new Set(), lastActiveMonth: row.report_month };
      perCustomer.set(key, entry);
    }
    entry.totalSpend += Number(row.amount_inc_tax);
    entry.months.add(row.report_month);
    // report_month is "yyyy-MM" — lexicographic comparison is chronological.
    if (row.report_month > entry.lastActiveMonth) entry.lastActiveMonth = row.report_month;
  }

  // Average lifespan computed per gym — gyms differ in retention, so a
  // customer's LTV is benchmarked against their own gym's typical
  // lifespan, not one figure blended across all 9.
  const lifespansByGym = new Map<GymName, number[]>();
  for (const entry of perCustomer.values()) {
    const list = lifespansByGym.get(entry.gym) ?? [];
    list.push(entry.months.size);
    lifespansByGym.set(entry.gym, list);
  }
  const avgLifespanByGym = new Map<GymName, number>();
  for (const [gym, lifespans] of lifespansByGym) {
    avgLifespanByGym.set(gym, lifespans.reduce((sum, n) => sum + n, 0) / lifespans.length);
  }

  return [...perCustomer.values()].map((entry) => {
    const activeMonths = entry.months.size;
    const avgMonthlySpend = entry.totalSpend / activeMonths;
    const gymAvgLifespan = avgLifespanByGym.get(entry.gym) ?? activeMonths;
    return {
      name: entry.name,
      gym: entry.gym,
      totalSpend: entry.totalSpend,
      activeMonths,
      avgMonthlySpend,
      ltv: avgMonthlySpend * gymAvgLifespan,
      lastActiveMonth: entry.lastActiveMonth,
    };
  });
}

function buildLtvHistogram(ltvValues: number[], bucketCount = 8): LtvHistogramBucket[] {
  if (ltvValues.length === 0) return [];
  const max = Math.max(...ltvValues);
  if (max === 0) return [{ rangeStart: 0, rangeEnd: 0, count: ltvValues.length }];

  const bucketSize = max / bucketCount;
  const buckets: LtvHistogramBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    rangeStart: i * bucketSize,
    rangeEnd: (i + 1) * bucketSize,
    count: 0,
  }));

  for (const value of ltvValues) {
    const index = Math.min(bucketCount - 1, Math.floor(value / bucketSize));
    buckets[index].count += 1;
  }

  return buckets;
}

/**
 * `gym` must already be security-resolved by the caller: an owner's own
 * gym always, an admin's explicit selection or null for "all gyms" — see
 * /api/members/summary.
 */
export async function getMemberInsightsSummary(gym: GymName | null, month: string): Promise<MemberInsightsSummary> {
  const [attendanceRows, completeness, revenueRows] = await Promise.all([
    fetchActiveAttendanceRows(gym, month),
    getAttendanceCompleteness(gym, month),
    fetchAllRevenueForLtv(gym),
  ]);

  const activeMemberCount = attendanceRows.length;
  const totalAttendance = attendanceRows.reduce((sum, row) => sum + row.attendance, 0);

  const named: AttendanceMember[] = attendanceRows.map((row) => ({
    userMemberId: row.user_member_id,
    name: `${row.first_name} ${row.last_name}`.trim(),
    gym: row.gym,
    attendance: row.attendance,
    lastAttended: row.last_attended,
  }));

  const atRiskMembers = named
    .filter((row) => row.attendance >= 1 && row.attendance <= 3)
    .sort((a, b) => a.attendance - b.attendance);

  const topAttenders = [...named].sort((a, b) => b.attendance - a.attendance).slice(0, 10);

  const ltvCustomers = computeLtv(revenueRows);
  const ltvValues = ltvCustomers.map((c) => c.ltv);
  // averageLtv/affordableCac deliberately use every customer who's ever
  // paid, churned or not — a churned customer's full observed lifespan is
  // real data that's part of what makes "average lifespan" meaningful; only
  // the *displayed* Top 20 list below excludes them, since that list's job
  // is "who to focus on now," not a historical record.
  const averageLtv = ltvValues.length > 0 ? ltvValues.reduce((sum, v) => sum + v, 0) / ltvValues.length : null;

  // Anchored to the latest completed month regardless of the page's month
  // filter — same "not scoped to the month filter" rule as the rest of the
  // LTV section. A 3-month rolling window: generous enough that a PAYG
  // customer between pack purchases doesn't wrongly drop off, but still
  // excludes someone who's been gone 6+ months.
  const recentCutoff = shiftMonth(getDefaultReportMonth(), -2);
  const topCustomers = ltvCustomers
    .filter((c) => c.lastActiveMonth >= recentCutoff)
    .sort((a, b) => b.ltv - a.ltv)
    .slice(0, 20);

  return {
    month,
    activeMemberCount,
    avgAttendancePerActiveMember: activeMemberCount > 0 ? totalAttendance / activeMemberCount : null,
    atRiskMembers,
    topAttenders,
    gymsWithNoAttendanceData: completeness.gymsWithNoAttendanceData,
    noAttendanceDataForGym: completeness.noAttendanceDataForGym,
    ltv: {
      topCustomers,
      distribution: buildLtvHistogram(ltvValues),
      averageLtv,
      affordableCac: averageLtv !== null ? averageLtv / 3 : null,
      customerCount: ltvCustomers.length,
    },
  };
}

/**
 * Full customer list for the directory/lookup page — same fetch + compute
 * as the LTV section above, just not sliced to the Top 20. Not a new query
 * pattern or extra cost: it's the identical all-gym-scoped fetch the
 * Members page already performs on every load.
 */
export async function getCustomerDirectory(gym: GymName | null): Promise<LtvCustomer[]> {
  const revenueRows = await fetchAllRevenueForLtv(gym);
  // Most recently active first — lets a reader spot who's actually current
  // at a glance rather than paging past long-churned customers alphabetically.
  // lastActiveMonth is "yyyy-MM", so lexicographic comparison is chronological.
  return computeLtv(revenueRows).sort((a, b) => b.lastActiveMonth.localeCompare(a.lastActiveMonth));
}

export interface CustomerProfile {
  name: string;
  gym: GymName;
  totalSpend: number;
  activeMonths: number;
  avgMonthlySpend: number;
  ltv: number;
  lastActiveMonth: string;
  transactions: {
    date: string;
    item: string;
    category: "MEMBERSHIP" | "CREDIT_PACK";
    quantitySold: number;
    amountIncTax: number;
  }[];
  /** null = no matching attendance rows found for this name (Hackney/Crewe
   *  gap, or a name-format mismatch) — surfaced as-is, never guessed at. */
  attendance: { reportMonth: string; attendance: number; lastAttended: string | null }[] | null;
}

async function fetchCustomerTransactions(
  gym: GymName,
  name: string
): Promise<{ date: string; item: string; category: "MEMBERSHIP" | "CREDIT_PACK"; quantitySold: number; amountIncTax: number }[]> {
  const admin = createAdminClient();
  const rows: {
    date: string;
    item: string;
    category: "MEMBERSHIP" | "CREDIT_PACK";
    quantitySold: number;
    amountIncTax: number;
  }[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("Revenue")
      .select("date, item, category, quantity_sold, amount_inc_tax")
      .eq("gym", gym)
      .eq("sold_to", name)
      .order("date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as {
      date: string;
      item: string;
      category: "MEMBERSHIP" | "CREDIT_PACK";
      quantity_sold: number;
      amount_inc_tax: number;
    }[];
    rows.push(
      ...page.map((r) => ({
        date: r.date,
        item: r.item,
        category: r.category,
        quantitySold: r.quantity_sold,
        amountIncTax: Number(r.amount_inc_tax),
      }))
    );

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Best-effort inverse of the `${first_name} ${last_name}`.trim()` convention
 * used to build a display name elsewhere in this file — splits on the first
 * space so multi-part surnames ("Mary Jane Smith") still round-trip, since
 * `last_name` is whatever GymFlow stored as-is.
 */
function splitName(name: string): { firstName: string; lastName: string } {
  const spaceIndex = name.indexOf(" ");
  if (spaceIndex === -1) return { firstName: name, lastName: "" };
  return { firstName: name.slice(0, spaceIndex), lastName: name.slice(spaceIndex + 1) };
}

async function fetchCustomerAttendance(
  gym: GymName,
  name: string
): Promise<{ reportMonth: string; attendance: number; lastAttended: string | null }[] | null> {
  const { firstName, lastName } = splitName(name);
  const admin = createAdminClient();
  const rows: { reportMonth: string; attendance: number; lastAttended: string | null }[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("attendance")
      .select("report_month, attendance, last_attended")
      .eq("gym", gym)
      .eq("first_name", firstName)
      .eq("last_name", lastName)
      .order("report_month", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as { report_month: string; attendance: number; last_attended: string | null }[];
    rows.push(...page.map((r) => ({ reportMonth: r.report_month, attendance: r.attendance, lastAttended: r.last_attended })));

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows.length > 0 ? rows : null;
}

/**
 * Single-customer profile: the LTV figure comes from a single-gym LTV
 * computation (same cost as loading the Members page for that gym, since
 * the multiplier depends on the gym's average customer lifespan) so it
 * always matches what's shown elsewhere; the transaction and attendance
 * history are separate small, targeted queries scoped to just this person,
 * not a gym-wide scan.
 */
export async function getCustomerProfile(gym: GymName, name: string): Promise<CustomerProfile | null> {
  const [revenueRows, transactions, attendance] = await Promise.all([
    fetchAllRevenueForLtv(gym),
    fetchCustomerTransactions(gym, name),
    fetchCustomerAttendance(gym, name),
  ]);

  const ltvEntry = computeLtv(revenueRows).find((c) => c.name === name);
  if (!ltvEntry) return null;

  return {
    name: ltvEntry.name,
    gym: ltvEntry.gym,
    totalSpend: ltvEntry.totalSpend,
    activeMonths: ltvEntry.activeMonths,
    avgMonthlySpend: ltvEntry.avgMonthlySpend,
    ltv: ltvEntry.ltv,
    lastActiveMonth: ltvEntry.lastActiveMonth,
    transactions,
    attendance,
  };
}
