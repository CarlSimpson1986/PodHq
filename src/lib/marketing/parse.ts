import Papa from "papaparse";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_SPAN_DAYS = 9;

export interface WeeklyAdSpendDraft {
  weekStarting: string; // yyyy-MM-dd, always a Monday
  spendGbp: number;
  clicks: number;
  leads: number;
}

interface ParseResult {
  weeks: WeeklyAdSpendDraft[];
  warnings: string[];
}

export interface LeadDraft {
  leadSourceId: string; // GymFlow's own "Lead ID" — the upsert key, see 0008_leads.sql
  firstName: string;
  lastName: string;
  email: string;
  createdDate: string; // yyyy-MM-dd
}

interface LeadsParseResult {
  weeks: WeeklyAdSpendDraft[];
  leads: LeadDraft[];
  warnings: string[];
}

/**
 * Real Meta Ads exports have been seen using both `2026-07-17` (ISO) and
 * `17/07/2026` (DD/MM/YYYY) for the same "Reporting starts" column,
 * apparently depending on export settings at the time — parse whichever
 * shows up. GymFlow's leads export always includes a time component
 * ("09/04/2025 09:41:11") but the date part is the same DD/MM/YYYY form.
 */
function parseFlexibleDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  const uk = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (uk) {
    const [, d, m, y] = uk;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  return null;
}

/**
 * Monday (UTC) of the ISO week containing `date`, as yyyy-MM-dd. Real Meta
 * exports don't always start their reporting week on a Monday (Friday- and
 * Thursday-start weeks have both been seen in practice) — normalizing here
 * is what keeps `ad_spend.week_starting` consistent regardless of which day
 * the export happened to use.
 */
function mondayOf(date: Date): string {
  const day = date.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(date.getTime() - daysSinceMonday * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/**
 * Sums `Amount spent (GBP)` across every row in a week regardless of what
 * that ad set was optimising for — the money was spent either way — but
 * only sums `Results` into `clicks` for rows where `Result indicator` is
 * actions:link_click, since "Results" is generic and can mean landing-page
 * views or leads depending on the ad set's objective; counting all of them
 * as clicks would corrupt CPC.
 *
 * Rows are also expected to represent a single week each. A "Campaigns"-
 * level export (as opposed to the weekly "Ad sets" export) can report over
 * a custom multi-month range instead — silently treating that as one week's
 * spend would badly distort the weekly trend, so rows spanning more than
 * ~9 days are skipped with a warning rather than absorbed.
 */
export function parseMetaCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const byWeek = new Map<string, { spendGbp: number; clicks: number }>();
  const warnings: string[] = [];

  for (const row of parsed.data) {
    const starts = parseFlexibleDate(row["Reporting starts"]);
    const ends = parseFlexibleDate(row["Reporting ends"]);
    if (!starts) {
      warnings.push('Skipped a row with an unreadable "Reporting starts" date.');
      continue;
    }

    if (ends) {
      const spanDays = Math.round((ends.getTime() - starts.getTime()) / DAY_MS) + 1;
      if (spanDays > MAX_REPORT_SPAN_DAYS) {
        warnings.push(
          `Skipped a row spanning ${spanDays} days (${row["Reporting starts"]} to ${row["Reporting ends"]}) — not a single week. Re-export using the weekly "Ad sets" breakdown.`
        );
        continue;
      }
    }

    const week = mondayOf(starts);
    const entry = byWeek.get(week) ?? { spendGbp: 0, clicks: 0 };
    entry.spendGbp += Number(row["Amount spent (GBP)"]) || 0;
    if (row["Result indicator"] === "actions:link_click") {
      entry.clicks += Number(row["Results"]) || 0;
    }
    byWeek.set(week, entry);
  }

  const weeks = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStarting, { spendGbp, clicks }]) => ({ weekStarting, spendGbp, clicks, leads: 0 }));

  return { weeks, warnings };
}

/**
 * Row count per week (by "Created Date") = lead count — no gym column in
 * this export, so which gym it belongs to is chosen in the upload form,
 * same as the Meta CSV. Also extracts each row's own name/email (Stage 8
 * only ever kept the count; the individual leads were thrown away) — a row
 * still counts toward the weekly total even if its Lead ID or Email is
 * missing, since the weekly CPL figure shouldn't regress just because lead
 * detail can't be captured for that one row.
 */
export function parseLeadsCsv(csvText: string): LeadsParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const byWeek = new Map<string, number>();
  const leads: LeadDraft[] = [];
  const warnings: string[] = [];

  for (const row of parsed.data) {
    const created = parseFlexibleDate(row["Created Date"]);
    if (!created) {
      warnings.push('Skipped a row with an unreadable "Created Date".');
      continue;
    }
    const week = mondayOf(created);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);

    const leadSourceId = (row["Lead ID"] ?? "").trim();
    const email = (row["Email"] ?? "").trim();
    if (leadSourceId && email) {
      leads.push({
        leadSourceId,
        firstName: (row["First Name"] ?? "").trim(),
        lastName: (row["Last Name"] ?? "").trim(),
        email,
        createdDate: created.toISOString().slice(0, 10),
      });
    } else {
      warnings.push("Skipped lead detail for a row missing a Lead ID or Email (still counted in the weekly total).");
    }
  }

  const weeks = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStarting, leadsCount]) => ({ weekStarting, spendGbp: 0, clicks: 0, leads: leadsCount }));

  return { weeks, leads, warnings };
}

/**
 * Merges Meta (spend/clicks) and leads (count) draft weeks into one row per
 * week. A week present in only one file still gets a real row rather than
 * being dropped — a franchisee might upload one file before the other, or a
 * week might genuinely have no leads.
 */
export function mergeWeeklyDrafts(
  metaWeeks: WeeklyAdSpendDraft[],
  leadsWeeks: WeeklyAdSpendDraft[]
): WeeklyAdSpendDraft[] {
  const byWeek = new Map<string, WeeklyAdSpendDraft>();

  for (const w of metaWeeks) {
    byWeek.set(w.weekStarting, { ...w });
  }
  for (const w of leadsWeeks) {
    const existing = byWeek.get(w.weekStarting);
    if (existing) {
      existing.leads = w.leads;
    } else {
      byWeek.set(w.weekStarting, { ...w });
    }
  }

  return [...byWeek.values()].sort((a, b) => a.weekStarting.localeCompare(b.weekStarting));
}
