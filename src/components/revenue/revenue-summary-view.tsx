"use client";

import { useState, useTransition } from "react";
import { formatGBP, formatNumber, formatPercent, formatMonthLabel } from "@/lib/format";
import type { GymName } from "@/lib/data/types";
import type { DateRangePreset, RevenueRangeSummary, MonthRange } from "@/lib/data/revenue";
import { CategoryPieChart } from "./category-pie-chart";
import { CategoryTrendChart } from "./category-trend-chart";
import { TrendYoyChart } from "./trend-yoy-chart";
import { TopProductsChart } from "./top-products-chart";
import { TopCustomersTable } from "./top-customers-table";
import { GymSelect } from "@/components/ui/gym-select";

function formatRange(range: MonthRange): string {
  return range.start === range.end
    ? formatMonthLabel(range.start)
    : `${formatMonthLabel(range.start)} – ${formatMonthLabel(range.end)}`;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "last_month", label: "Last month" },
  { value: "qtd", label: "Quarter to date" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "full_year", label: "Full year" },
];

const currentYear = new Date().getUTCFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const buttonBase =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const buttonActive = "bg-accent text-accent-foreground";
const buttonInactive = "bg-card border border-card-border text-muted-foreground hover:text-foreground";

interface RevenueSummaryViewProps {
  role: "admin" | "owner";
  initialPreset: DateRangePreset;
  initialGym: GymName | null;
  initialSummary: RevenueRangeSummary;
}

export function RevenueSummaryView({ role, initialPreset, initialGym, initialSummary }: RevenueSummaryViewProps) {
  const [preset, setPreset] = useState(initialPreset);
  const [year, setYear] = useState(currentYear);
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [summary, setSummary] = useState<RevenueRangeSummary | null>(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextPreset: DateRangePreset, nextYear: number, nextGym: GymName | null) {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ preset: nextPreset });
        if (nextPreset === "full_year") params.set("year", String(nextYear));
        if (role === "admin" && nextGym) params.set("gym", nextGym);

        const res = await fetch(`/api/revenue/summary?${params.toString()}`);
        const body = await res.json();
        if (body.status !== "ok") {
          // Clear the old summary rather than leave it on screen — it's for
          // a different filter selection now and showing it would be
          // actively misleading, not just stale.
          setSummary(null);
          setError(body.message ?? "Could not load revenue data.");
          return;
        }
        setSummary(body.summary);
      } catch {
        setSummary(null);
        setError("Something went wrong. Try again.");
      }
    });
  }

  function handlePresetChange(next: DateRangePreset) {
    setPreset(next);
    refetch(next, year, gym);
  }

  function handleYearChange(next: number) {
    setYear(next);
    refetch(preset, next, gym);
  }

  function handleGymChange(next: GymName | null) {
    setGym(next);
    refetch(preset, year, next);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Revenue — {gym ?? "All gyms"}</h1>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            disabled={isPending}
            onClick={() => handlePresetChange(p.value)}
            className={`${buttonBase} ${preset === p.value ? buttonActive : buttonInactive}`}
          >
            {p.label}
          </button>
        ))}

        {preset === "full_year" && (
          <select
            value={year}
            disabled={isPending}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            className="rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}

        {role === "admin" && (
          <GymSelect value={gym} onChange={handleGymChange} disabled={isPending} className="ml-auto" />
        )}
      </div>

      {isPending && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="mt-3 text-sm text-danger">
          {error} {!isPending && "Pick a filter above to retry."}
        </p>
      )}

      {summary && (
        <>
          <section className="mt-4 card-glass p-5">
            <p className="text-sm text-muted-foreground">
              {summary.label} revenue{" "}
              <span className="text-muted-foreground/70">({formatRange(summary.range)})</span>
            </p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{formatGBP(summary.total)}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {summary.previousPeriod && summary.previousPeriod.percentChange !== null && (
                <span className={summary.previousPeriod.percentChange >= 0 ? "text-success" : "text-danger"}>
                  {formatPercent(summary.previousPeriod.percentChange)} vs previous period
                </span>
              )}
              {summary.sameRangeLastYear.percentChange !== null && (
                <span className={summary.sameRangeLastYear.percentChange >= 0 ? "text-success" : "text-danger"}>
                  {formatPercent(summary.sameRangeLastYear.percentChange)} vs same period last year
                </span>
              )}
            </div>
          </section>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card-glass p-5">
              <p className="text-sm text-muted-foreground">Transactions</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(summary.transactionCount)}</p>
            </div>
            <div className="card-glass p-5">
              <p className="text-sm text-muted-foreground">Average revenue per transaction</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {summary.averageRevenuePerTransaction !== null
                  ? formatGBP(summary.averageRevenuePerTransaction)
                  : "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryPieChart data={summary.categoryBreakdown} />
            <CategoryTrendChart data={summary.categoryTrend} />
          </div>

          <div className="mt-4">
            <TrendYoyChart data={summary.trend} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TopProductsChart data={summary.topProducts} />
            <TopCustomersTable data={summary.topCustomers} />
          </div>
        </>
      )}
    </div>
  );
}
