import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "@/lib/data/types";
import type { DoorTrafficPreset } from "@/lib/data/door-traffic-presets";

// Door entries cached monthly from Kisi/PDK (src/lib/door-history.ts),
// aggregated by door_entry_summary (0103). Unlike Revenue/attendance this
// isn't limited to completed months — the monthly cron fills history, and
// a re-run of the current month (?month=) brings it up to date.

type Bucket = "day" | "month";

export interface DoorTrafficPoint {
  bucket: string;
  entries: number;
  denied: number;
  people: number;
}

export interface DoorTrafficSummary {
  preset: DoorTrafficPreset;
  bucket: Bucket;
  from: string;
  to: string;
  totals: { entries: number; denied: number; people: number };
  series: DoorTrafficPoint[];
  // dow is ISO (1 = Monday), hour 0-23, both UK local time.
  heat: { dow: number; hour: number; entries: number }[];
  byGym: { gym: string; entries: number; denied: number; people: number }[];
  top: { name: string | null; gyms: string; visits: number; lastVisit: string }[];
  firstEntry: string | null;
}

interface RpcResult {
  totals: DoorTrafficSummary["totals"];
  series: DoorTrafficPoint[];
  heat: DoorTrafficSummary["heat"];
  by_gym: DoorTrafficSummary["byGym"];
  top: { name: string | null; gyms: string; visits: number; last_visit: string }[];
  first_entry: string | null;
}

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function resolveRange(preset: DoorTrafficPreset, now: Date): { from: Date; to: Date; bucket: Bucket } {
  const tomorrow = new Date(utcDay(now).getTime() + 864e5);
  switch (preset) {
    case "last_30_days":
      return { from: new Date(tomorrow.getTime() - 30 * 864e5), to: tomorrow, bucket: "day" };
    case "last_90_days":
      return { from: new Date(tomorrow.getTime() - 90 * 864e5), to: tomorrow, bucket: "day" };
    case "last_12_months":
      return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)), to: tomorrow, bucket: "month" };
    case "all_time":
      return { from: new Date(Date.UTC(2020, 0, 1)), to: tomorrow, bucket: "month" };
  }
}

// The RPC only returns buckets that had events — fill the gaps with zeros
// so a quiet day or month reads as zero on the chart rather than vanishing.
function fillSeries(points: DoorTrafficPoint[], from: Date, to: Date, bucket: Bucket): DoorTrafficPoint[] {
  const byKey = new Map(points.map((p) => [p.bucket, p]));
  const out: DoorTrafficPoint[] = [];
  const cursor = bucket === "day" ? utcDay(from) : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor < to) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(byKey.get(key) ?? { bucket: key, entries: 0, denied: 0, people: 0 });
    if (bucket === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export async function getDoorTraffic(gym: GymName | null, preset: DoorTrafficPreset): Promise<DoorTrafficSummary> {
  const now = new Date();
  const range = resolveRange(preset, now);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("door_entry_summary", {
    p_gym: gym,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_bucket: range.bucket,
  });
  if (error) throw new Error(`getDoorTraffic: ${error.message}`);
  const result = data as RpcResult;

  // All time starts at the gym's first cached entry, not the 2020 floor.
  const seriesFrom =
    preset === "all_time" && result.first_entry ? new Date(result.first_entry) : range.from;

  return {
    preset,
    bucket: range.bucket,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    totals: result.totals,
    series: fillSeries(result.series, seriesFrom, range.to, range.bucket),
    heat: result.heat,
    byGym: result.by_gym,
    top: result.top.map((t) => ({ name: t.name, gyms: t.gyms, visits: t.visits, lastVisit: t.last_visit })),
    firstEntry: result.first_entry,
  };
}
