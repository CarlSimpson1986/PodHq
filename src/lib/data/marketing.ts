import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName, LeadStatus } from "./types";
import { fetchAllRevenueForLtv, computeLtv } from "./members";
import type { WeeklyAdSpendDraft, LeadDraft } from "@/lib/marketing/parse";

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

export interface RecentLead {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  createdDate: string;
  status: LeadStatus;
  memberId: number | null;
}

// A lead converts only on a real money-moving event against their own
// ledger: a Stripe credit-pack purchase or membership subscription
// (podhq-client's webhooks/stripe/route.ts, reason: "purchase" /
// "membership"). Deliberately excludes manual_grant (a staff comp, not a
// purchase), booking_used/booking_refund (consumption/reversal, not
// acquisition), and gift_voucher (written on the *redeemer's* ledger when
// they spend someone else's gifted code — the purchaser's own ledger
// already gets counted via "purchase", so counting the redeemer too would
// double up on one real sale).
const CONVERTED_REASONS = ["purchase", "membership"] as const;

export interface MarketingSummary {
  gym: GymName | null;
  totals: { spendGbp: number; clicks: number; leads: number; cpc: number | null; cpl: number | null };
  /** Last 12 weeks, ascending — for the trend charts. */
  weeklyTrend: WeeklyAdSpend[];
  /** All weeks, most recent first — for the week-by-week table. */
  weeklyTable: WeeklyAdSpend[];
  /** Most recent leads, most recent first — null when no single gym is in
   *  view (admin "All gyms"), same convention as Outgoings' history/gym. */
  recentLeads: RecentLead[] | null;
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
  const [rows, revenueRows, recentLeads] = await Promise.all([
    fetchAdSpendRows(gym),
    fetchAllRevenueForLtv(gym),
    gym ? getRecentLeads(gym) : Promise.resolve(null),
  ]);

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
    recentLeads,
    ltvVsCac: { averageLtv, costPerLead, roiMultiple },
  };
}

const RECENT_LEADS_LIMIT = 100;

/**
 * Leads whose linked member has since made a real purchase are excluded
 * here, not flagged/updated anywhere — "converted" is a computed fact
 * (checked fresh on every read), never a stored status a webhook has to
 * remember to flip. Nothing about the underlying row is ever mutated by
 * this filter; a converted lead's own `status` column stays exactly
 * whatever it last was.
 *
 * Two queries in JS rather than a Postgres view/RPC: getRecentLeads is
 * already capped at RECENT_LEADS_LIMIT, so the input is bounded by
 * construction — this isn't the unbounded-ledger problem
 * get_credit_balance() exists to solve (PostgREST's silent 1000-row
 * truncation producing a *wrong number*), so there's no correctness reason
 * to push this into the database. CSV-imported rows (member_id always
 * null) are structurally unaffected — they can never appear in the
 * converted set.
 */
export async function getRecentLeads(gym: GymName): Promise<RecentLead[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leads")
    .select("id, first_name, last_name, email, created_date, status, member_id")
    .eq("gym", gym)
    .order("created_date", { ascending: false })
    .limit(RECENT_LEADS_LIMIT);
  if (error) throw error;

  const rows = data ?? [];
  const memberIds = [...new Set(rows.map((r) => r.member_id as number | null).filter((id): id is number => id !== null))];

  let convertedIds = new Set<number>();
  if (memberIds.length > 0) {
    const { data: creditRows, error: creditsError } = await admin
      .from("credits")
      .select("member_id")
      .in("member_id", memberIds)
      .in("reason", CONVERTED_REASONS);
    if (creditsError) throw creditsError;
    convertedIds = new Set((creditRows ?? []).map((r) => r.member_id as number));
  }

  return rows
    .filter((row) => row.member_id === null || !convertedIds.has(row.member_id as number))
    .map((row) => ({
      id: row.id as number,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      email: row.email as string,
      createdDate: row.created_date as string,
      status: row.status as LeadStatus,
      memberId: row.member_id as number | null,
    }));
}

/**
 * `.eq("id", id).eq("gym", gym)` ownership-scopes the update the same way
 * deleteOutgoing does — an owner can't change another gym's lead just by
 * guessing an id. Returns whether a row actually matched, so the route can
 * 404 instead of silently no-op'ing.
 */
export async function updateLeadStatus(id: number, gym: GymName, status: LeadStatus): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leads")
    .update({ status })
    .eq("id", id)
    .eq("gym", gym)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Upsert on (gym, lead_source_id) — GymFlow's own Lead ID — same
 * re-upload-overwrites-cleanly convention as upsertAdSpend. Requires the
 * unique index from supabase/migrations/0008_leads.sql.
 */
export async function upsertLeads(gym: GymName, leads: LeadDraft[], uploadedBy: string): Promise<void> {
  if (leads.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.from("leads").upsert(
    leads.map((l) => ({
      gym,
      lead_source_id: l.leadSourceId,
      first_name: l.firstName,
      last_name: l.lastName,
      email: l.email,
      created_date: l.createdDate,
      uploaded_by: uploadedBy,
    })),
    { onConflict: "gym,lead_source_id" }
  );
  if (error) throw error;
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

export interface ClearMarketingDataResult {
  adSpendDeleted: number;
  leadsDeleted: number;
}

/**
 * Permanently wipes every ad_spend row and every lead for one gym — the
 * whole point is a clean reset, so this is a hard delete, not a soft one.
 * Scoped to a single gym like every other write/delete in this app; never
 * a cross-gym action. Returns counts so the caller can show what actually
 * happened, not just "done".
 */
export async function clearMarketingData(gym: GymName): Promise<ClearMarketingDataResult> {
  const admin = createAdminClient();

  const { data: adSpendRows, error: adSpendError } = await admin
    .from("ad_spend")
    .delete()
    .eq("gym", gym)
    .select("id");
  if (adSpendError) throw adSpendError;

  const { data: leadRows, error: leadsError } = await admin.from("leads").delete().eq("gym", gym).select("id");
  if (leadsError) throw leadsError;

  return { adSpendDeleted: (adSpendRows ?? []).length, leadsDeleted: (leadRows ?? []).length };
}
