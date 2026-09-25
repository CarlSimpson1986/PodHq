"use client";

import { useState, useTransition } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/format";
import type { GymName } from "@/lib/data/types";
import type { DoorTrafficSummary } from "@/lib/data/door-traffic";
import {
  DOOR_TRAFFIC_PRESETS,
  DOOR_TRAFFIC_PRESET_LABELS,
  type DoorTrafficPreset,
} from "@/lib/data/door-traffic-presets";
import { GymSelect } from "@/components/ui/gym-select";

const ENTRY = "#18181b";
const DENIED = "#dc2626";
const GRID = "#e4e4e7";
const MUTED = "#71717a";
// formatPercent is for signed changes ("+4.0%") — a share needs no sign.
const share = (part: number, whole: number) => `${Math.round((part / Math.max(1, whole)) * 100)}%`;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function bucketLabel(bucket: string, kind: DoorTrafficSummary["bucket"]): string {
  const d = new Date(`${bucket}T12:00:00Z`);
  return kind === "day"
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function lastVisitLabel(local: string): string {
  const d = new Date(`${local}:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function daysCovered(summary: DoorTrafficSummary): number {
  const from = summary.preset === "all_time" && summary.firstEntry ? new Date(summary.firstEntry) : new Date(summary.from);
  return Math.max(1, Math.round((new Date(summary.to).getTime() - from.getTime()) / 864e5));
}

interface DoorTrafficViewProps {
  role: "admin" | "owner";
  initialGym: GymName | null;
  initialSummary: DoorTrafficSummary;
}

export function DoorTrafficView({ role, initialGym, initialSummary }: DoorTrafficViewProps) {
  const [preset, setPreset] = useState<DoorTrafficPreset>(initialSummary.preset);
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [summary, setSummary] = useState<DoorTrafficSummary | null>(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextPreset: DoorTrafficPreset, nextGym: GymName | null) {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ preset: nextPreset });
        if (role === "admin" && nextGym) params.set("gym", nextGym);
        const res = await fetch(`/api/door-traffic?${params.toString()}`);
        const body = await res.json();
        if (body.status !== "ok") {
          setSummary(null);
          setError(body.message ?? "Could not load door traffic.");
          return;
        }
        setSummary(body.summary);
      } catch {
        setSummary(null);
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Door traffic — {gym ?? "All gyms"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Entries at the door from Kisi and PDK, updated on the 1st of each month. Exit-button releases aren&apos;t counted.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-md border border-card-border bg-card p-1" role="group" aria-label="Period">
          {DOOR_TRAFFIC_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={isPending}
              aria-pressed={p === preset}
              onClick={() => {
                setPreset(p);
                refetch(p, gym);
              }}
              className={`rounded px-2.5 py-1 text-sm transition-colors disabled:opacity-50 ${
                p === preset ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-background"
              }`}
            >
              {DOOR_TRAFFIC_PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {role === "admin" && (
          <GymSelect
            value={gym}
            disabled={isPending}
            onChange={(next) => {
              setGym(next);
              refetch(preset, next);
            }}
          />
        )}
        {isPending && <span className="text-sm text-muted-foreground">Loading…</span>}
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {summary && <SummaryBody summary={summary} gym={gym} />}
    </div>
  );
}

function SummaryBody({ summary, gym }: { summary: DoorTrafficSummary; gym: GymName | null }) {
  const { totals } = summary;
  const attempts = totals.entries + totals.denied;

  if (attempts === 0) {
    return (
      <div className="mt-6 card-glass p-6 text-sm text-muted-foreground">
        {summary.firstEntry
          ? "No door entries in this period."
          : `No door data for ${gym ?? "any gym"} yet. Only gyms on Kisi or PDK are covered — other gyms still rely on GymFlow's attendance export.`}
      </div>
    );
  }

  const tiles = [
    { label: "Entries", value: formatNumber(totals.entries) },
    { label: "Average per day", value: (totals.entries / daysCovered(summary)).toFixed(1) },
    { label: "Different people", value: formatNumber(totals.people) },
    { label: "Denied attempts", value: `${formatNumber(totals.denied)} (${share(totals.denied, attempts)})` },
  ];

  return (
    <div className="mt-4 grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card-glass p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{t.value}</p>
          </div>
        ))}
      </div>

      <div className="card-glass p-5">
        <p className="text-sm font-semibold text-foreground">Entries per {summary.bucket}</p>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={summary.series} margin={{ left: 0, right: 8 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="bucket"
                tickFormatter={(b: string) => bucketLabel(b, summary.bucket)}
                stroke={GRID}
                tick={{ fill: MUTED, fontSize: 12 }}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis allowDecimals={false} stroke={GRID} tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} width={40} />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                contentStyle={{ background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 8 }}
                labelFormatter={(label) => bucketLabel(String(label), summary.bucket)}
                formatter={(value, name) => [formatNumber(Number(value)), name]}
              />
              <Legend formatter={(value) => <span style={{ color: MUTED }}>{value}</span>} />
              <Bar dataKey="entries" name="Entries" fill={ENTRY} radius={[3, 3, 0, 0]} />
              <Bar dataKey="denied" name="Denied" fill={DENIED} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Heatmap heat={summary.heat} />

      {gym === null && summary.byGym.length > 1 && (
        <div className="card-glass p-5">
          <p className="text-sm font-semibold text-foreground">By gym</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-card-border/20 text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Gym</th>
                  <th className="py-2 pr-4 text-right font-medium">Entries</th>
                  <th className="py-2 pr-4 text-right font-medium">Per day</th>
                  <th className="py-2 pr-4 text-right font-medium">People</th>
                  <th className="py-2 text-right font-medium">Denied</th>
                </tr>
              </thead>
              <tbody>
                {summary.byGym.map((g) => (
                  <tr key={g.gym} className="border-b border-card-border/10 last:border-0">
                    <td className="py-2 pr-4 text-foreground">{g.gym}</td>
                    <td className="py-2 pr-4 text-right">{formatNumber(g.entries)}</td>
                    <td className="py-2 pr-4 text-right">{(g.entries / daysCovered(summary)).toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right">{formatNumber(g.people)}</td>
                    <td className="py-2 text-right">
                      {share(g.denied, g.entries + g.denied)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card-glass p-5">
        <p className="text-sm font-semibold text-foreground">Most frequent visitors</p>
        <p className="mt-1 text-xs text-muted-foreground">Visits are days with at least one entry.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-card-border/20 text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Name</th>
                {gym === null && <th className="py-2 pr-4 font-medium">Gym</th>}
                <th className="py-2 pr-4 text-right font-medium">Visits</th>
                <th className="py-2 text-right font-medium">Last visit</th>
              </tr>
            </thead>
            <tbody>
              {summary.top.map((t, i) => (
                <tr key={`${t.name}-${i}`} className="border-b border-card-border/10 last:border-0">
                  <td className="py-2 pr-4 text-foreground">{t.name ?? "Unknown"}</td>
                  {gym === null && <td className="py-2 pr-4 text-muted-foreground">{t.gyms}</td>}
                  <td className="py-2 pr-4 text-right">{t.visits}</td>
                  <td className="py-2 text-right text-muted-foreground">{lastVisitLabel(t.lastVisit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Heatmap({ heat }: { heat: DoorTrafficSummary["heat"] }) {
  const grid = new Map(heat.map((h) => [`${h.dow}|${h.hour}`, h.entries]));
  const max = Math.max(1, ...heat.map((h) => h.entries));

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">When people come in</p>
      <p className="mt-1 text-xs text-muted-foreground">Entries by weekday and hour, UK time. Darker means busier.</p>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[640px] gap-[3px]" style={{ gridTemplateColumns: "40px repeat(24, minmax(0, 1fr))" }}>
          {DAYS.map((day, di) => (
            <div key={day} className="contents">
              <span className="self-center text-xs text-muted-foreground">{day}</span>
              {Array.from({ length: 24 }, (_, hour) => {
                const v = grid.get(`${di + 1}|${hour}`) ?? 0;
                return (
                  <div
                    key={hour}
                    title={`${day} ${String(hour).padStart(2, "0")}:00 — ${v} ${v === 1 ? "entry" : "entries"}`}
                    className="h-6 rounded-sm"
                    style={{ background: v ? `rgba(24,24,27,${0.08 + 0.92 * (v / max)})` : "#f4f4f5" }}
                  />
                );
              })}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="text-center text-[10px] text-muted-foreground">
              {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
