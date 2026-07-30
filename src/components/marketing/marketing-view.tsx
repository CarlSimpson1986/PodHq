"use client";

import { useState, useTransition } from "react";
import { formatGBP } from "@/lib/format";
import type { GymName } from "@/lib/data/types";
import type { MarketingSummary } from "@/lib/data/marketing";
import { WeeklySpendChart } from "./weekly-spend-chart";
import { WeeklyRateChart } from "./weekly-rate-chart";
import { LtvVsCacCard } from "./ltv-vs-cac-card";
import { WeeklyTable } from "./weekly-table";
import { AdSpendUploadForm } from "./ad-spend-upload-form";
import { GymSelect } from "@/components/ui/gym-select";

interface MarketingViewProps {
  role: "admin" | "owner";
  initialGym: GymName | null;
  initialSummary: MarketingSummary;
}

export function MarketingView({ role, initialGym, initialSummary }: MarketingViewProps) {
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [summary, setSummary] = useState<MarketingSummary>(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextGym: GymName | null) {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (role === "admin" && nextGym) params.set("gym", nextGym);

        const res = await fetch(`/api/marketing/summary?${params.toString()}`);
        const body = await res.json();
        if (body.status !== "ok") {
          setError(body.message ?? "Could not load marketing data.");
          return;
        }
        setSummary(body.summary);
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  function handleGymChange(next: GymName | null) {
    setGym(next);
    refetch(next);
  }

  // Owner is always locked to their own gym. Admin needs an explicit gym
  // selected (not "All gyms") before there's a single target to attribute
  // an upload to — same fallback-edit-access pattern as Outgoings.
  const uploadTargetGym = role === "owner" ? initialGym : gym;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Marketing — {gym ?? "All gyms"}</h1>

      {role === "admin" && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <GymSelect value={gym} onChange={handleGymChange} disabled={isPending} />
        </div>
      )}

      {isPending && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="mt-3 text-sm text-danger">
          {error} {!isPending && "Pick a filter above to retry."}
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="card-glass p-5">
            <p className="text-sm text-muted-foreground">Total spend</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{formatGBP(summary.totals.spendGbp)}</p>
          </div>
          <div className="card-glass p-5">
            <p className="text-sm text-muted-foreground">Total clicks</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{summary.totals.clicks}</p>
          </div>
          <div className="card-glass p-5">
            <p className="text-sm text-muted-foreground">Total leads</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{summary.totals.leads}</p>
          </div>
          <div className="card-glass p-5">
            <p className="text-sm text-muted-foreground">Avg. CPL</p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {summary.totals.cpl !== null ? formatGBP(summary.totals.cpl) : "—"}
            </p>
          </div>
        </div>

        <WeeklySpendChart data={summary.weeklyTrend} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WeeklyRateChart
            title="Cost per click (last 12 weeks)"
            data={summary.weeklyTrend}
            dataKey="cpc"
            seriesName="CPC"
            formatValue={formatGBP}
          />
          <WeeklyRateChart
            title="Cost per lead (last 12 weeks)"
            data={summary.weeklyTrend}
            dataKey="cpl"
            seriesName="CPL"
            formatValue={formatGBP}
          />
        </div>

        <LtvVsCacCard ltvVsCac={summary.ltvVsCac} />

        {uploadTargetGym && (
          <AdSpendUploadForm gym={uploadTargetGym} isAdmin={role === "admin"} onSaved={() => refetch(gym)} />
        )}

        <WeeklyTable weeks={summary.weeklyTable} />
      </div>
    </div>
  );
}
