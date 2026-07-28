import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";
import { fetchAllRevenueForLtv, computeLtv } from "./members";
import type { WeeklyAdSpendDraft } from "@/lib/marketing/parse";

export interface WeeklyAdSpend {
  weekStarting: string;
  spendGbp: number;
  clicks: number;
  leads: number;
  /** Derived at query time, never stored — null when there's no denominator
   *  yet (e.g. a week with spend but zero recorded clicks). */
  cpc: number | null;
  cpl: number | null;
}

export interface MarketingSummary {
  gym: GymName | null;
  totals: { spendGbp: number; clicks: number; leads: number; cpc: number | null; cpl: number | null };
  /** Last 12 weeks, ascending — for the trend charts. */
  weeklyTrend: WeeklyAdSpend[];
  /** All weeks, most recent first — for the week-by-week table. */
  weeklyTable: WeeklyAdSpend[];
  ltvVsCac: {
    averageLtv: number | null;
    /** All-time total spend ÷ total leads — the closest available proxy for
     *  cost-to-acquire, since GymFlow doesn't expose which leads actually
     *  converted into paying members (same "no join/cancel data" gap
     *  documented for LTV/churn elsewhere). Labelled "cost per lead" in the
     *  UI rather than "CAC" for that reason. */
    costPerLead: number | null;
    roiMultiple: number | null;
  };
}

/**
 * All rows for a gym (or every gym when `gym` is null) — a plain query, not
 * the paginated `.range()` loop used for Revenue/attendance: this is a tiny
 * app-managed table (one row per gym per week), nowhere near the 1000-row
 * PostgREST cap that pagination rule exists for. Same precedent as
 * gym_outgoings in src/lib/data/outgoings.ts.
 */
async function fetchAdSpendRows(
  gym: GymName | null
): Promise<{ gym: GymName; week_starting: string; spend_gbp: number; clicks: number; leads: number }[]> {
  const admin = createAdminClient();
  const base = admin
    .from("ad_spend")
    .select("gym, week_starting, spend_gbp, clicks, leads")
    .order("week_starting", { ascending: true });
  const query = gym ? base.eq("gym", gym) : base;

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as { gym: GymName; week_starting: string; spend_gbp: number; clicks: number; leads: number }[];
}

function toWeeklyAdSpend(
  weekStarting: string,
  entry: { spendGbp: number; clicks: number; leads: number }
): WeeklyAdSpend {
  return {
    weekStarting,
    spendGbp: entry.spendGbp,
    clicks: entry.clicks,
    leads: entry.leads,
    cpc: entry.clicks > 0 ? entry.spendGbp / entry.clicks : null,
    cpl: entry.leads > 0 ? entry.spendGbp / entry.leads : null,
  };
}

const TREND_WEEKS = 12;

/**
 * `gym` must already be security-resolved by the caller: an owner's own gym
 * always, an admin's explicit selection or null for "all gyms" — see
 * /api/marketing/summary. When `gym` is null, rows from every gym are summed
 * per week (a franchise-wide weekly trend), same convention as the
 * consolidated P&L row.
 */
export async function getMarketingSummary(gym: GymName | null): Promise<MarketingSummary> {
  const [rows, revenueRows] = await Promise.all([fetchAdSpendRows(gym), fetchAllRevenueForLtv(gym)]);

  const byWeek = new Map<string, { spendGbp: number; clicks: number; leads: number }>();
  for (const row of rows) {
    const entry = byWeek.get(row.week_starting) ?? { spendGbp: 0, clicks: 0, leads: 0 };
    entry.spendGbp += Number(row.spend_gbp);
    entry.clicks += row.clicks;
    entry.leads += row.leads;
    byWeek.set(row.week_starting, entry);
  }

  const allWeeks = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStarting, entry]) => toWeeklyAdSpend(weekStarting, entry));

  const totalsRaw = rows.reduce(
    (acc, r) => ({
      spendGbp: acc.spendGbp + Number(r.spend_gbp),
      clicks: acc.clicks + r.clicks,
      leads: acc.leads + r.leads,
    }),
    { spendGbp: 0, clicks: 0, leads: 0 }
  );
  const totals = {
    ...totalsRaw,
    cpc: totalsRaw.clicks > 0 ? totalsRaw.spendGbp / totalsRaw.clicks : null,
    cpl: totalsRaw.leads > 0 ? totalsRaw.spendGbp / totalsRaw.leads : null,
  };

  // Same ARPU x avg-lifespan LTV used throughout Member Insights — reused
  // here rather than recomputed, so this figure always matches that page.
  const ltvValues = computeLtv(revenueRows).map((c) => c.ltv);
  const averageLtv = ltvValues.length > 0 ? ltvValues.reduce((sum, v) => sum + v, 0) / ltvValues.length : null;
  const costPerLead = totals.cpl;
  const roiMultiple =
    averageLtv !== null && costPerLead !== null && costPerLead > 0 ? averageLtv / costPerLead : null;

  return {
    gym,
    totals,
    weeklyTrend: allWeeks.slice(-TREND_WEEKS),
    weeklyTable: [...allWeeks].reverse(),
    ltvVsCac: { averageLtv, costPerLead, roiMultiple },
  };
}

/**
 * Upsert on (gym, week_starting) — re-uploading a week (correcting a bad
 * export, or a franchisee catching up on several missed weeks at once)
 * cleanly overwrites just that week rather than duplicating it. Requires
 * the unique index from supabase/migrations/0004_ad_spend_upsert.sql to
 * already exist in the database — .upsert()'s onConflict target has to
 * match a real unique constraint or Postgres rejects it.
 */
export async function upsertAdSpend(gym: GymName, weeks: WeeklyAdSpendDraft[], uploadedBy: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("ad_spend").upsert(
    weeks.map((w) => ({
      gym,
      week_starting: w.weekStarting,
      spend_gbp: w.spendGbp,
      clicks: w.clicks,
      leads: w.leads,
      uploaded_by: uploadedBy,
    })),
    { onConflict: "gym,week_starting" }
  );
  if (error) throw error;
}
