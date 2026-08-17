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
import { DateRangeDropdown } from "./date-range-dropdown";

function formatRange(range: MonthRange): string {
  return range.start === range.end
    ? formatMonthLabel(range.start)
    : `${formatMonthLabel(range.start)} – ${formatMonthLabel(range.end)}`;
}

const currentYear = new Date().getUTCFullYear();

// Mirrors getDefaultReportMonth() server-side (src/lib/data/dashboard.ts) —
// the pipeline never has current-month data, so the month picker's upper
// bound is last calendar month, not this one. The server clamps
// independently too (resolveDateRange's "month" case) — this is only a UX
// nicety so the picker doesn't even offer an out-of-range month.
const now = new Date();
const lastCompletedMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const LAST_COMPLETED_MONTH = `${lastCompletedMonthDate.getUTCFullYear()}-${String(
  lastCompletedMonthDate.getUTCMonth() + 1
).padStart(2, "0")}`;

interface RevenueSummaryViewProps {
  role: "admin" | "owner";
  initialPreset: DateRangePreset;
  initialGym: GymName | null;
  initialSummary: RevenueRangeSummary;
}

export function RevenueSummaryView({ role, initialPreset, initialGym, initialSummary }: RevenueSummaryViewProps) {
  const [preset, setPreset] = useState(initialPreset);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(LAST_COMPLETED_MONTH);
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [summary, setSummary] = useState<RevenueRangeSummary | null>(initialSummary);
  // Tracked separately from `summary` — the dropdown trigger needs a range
  // to display even when a fetch errors and summary is cleared to null
  // (see below), otherwise the one control that lets a user recover from
  // an error would itself disappear along with the failed data.
  const [range, setRange] = useState<MonthRange>(initialSummary.range);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextPreset: DateRangePreset, nextYear: number, nextMonth: string, nextGym: GymName | null) {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ preset: nextPreset });
        if (nextPreset === "full_year") params.set("year", String(nextYear));
        if (nextPreset === "month") params.set("month", nextMonth);
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
        setRange(body.summary.range);
      } catch {
        setSummary(null);
        setError("Something went wrong. Try again.");
      }
    });
  }

  function handlePresetChange(next: DateRangePreset) {
    setPreset(next);
    refetch(next, year, month, gym);
  }

  // Combined, not composed from handlePresetChange + a separate year
  // setter — see date-range-dropdown.tsx's onSelectYear for why calling
  // two state-setting handlers back to back here would refetch twice off
  // stale closures.
  function handleSelectYear(next: number) {
    setYear(next);
    setPreset("full_year");
    refetch("full_year", next, month, gym);
  }

  function handleMonthChange(next: string) {
    setMonth(next);
    setPreset("month");
    refetch("month", year, next, gym);
  }

  function handleGymChange(next: GymName | null) {
    setGym(next);
    refetch(preset, year, month, next);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Revenue — {gym ?? "All gyms"}</h1>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <DateRangeDropdown
          preset={preset}
          month={month}
          range={range}
          lastCompletedMonth={LAST_COMPLETED_MONTH}
          disabled={isPending}
          onPreset={handlePresetChange}
          onSelectYear={handleSelectYear}
          onMonth={handleMonthChange}
        />

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

          {summary.otherIncome > 0 && (
            <section className="mt-4 card-glass p-5">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">GymFlow revenue</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{formatGBP(summary.total)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Other income</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{formatGBP(summary.otherIncome)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Combined total</p>
                  <p className="mt-1 text-lg font-semibold text-accent">
                    {formatGBP(summary.total + summary.otherIncome)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Other income (room rental, vending, PT, etc. — entered on the Outgoings &amp; P&amp;L page) isn&apos;t
                GymFlow data, so it&apos;s kept out of the figures above and every chart on this page — the
                vs-previous-period/YoY comparisons, category split, and top products/customers all reflect GymFlow
                revenue only.
              </p>
            </section>
          )}

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
