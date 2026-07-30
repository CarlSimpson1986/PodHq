"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatGBP, formatNumber, formatMonthLabel, formatDate, formatDaysAgo, customerProfileHref } from "@/lib/format";
import type { GymName } from "@/lib/data/types";
import type { MemberInsightsSummary } from "@/lib/data/members";
import { LtvHistogramChart } from "./ltv-histogram-chart";
import { TopLtvCustomersTable } from "./top-ltv-customers-table";
import { GymSelect } from "@/components/ui/gym-select";

// Duplicated rather than imported from lib/data/dashboard — that module is
// "server-only" and this is a client component.
function shiftMonth(month: string, deltaMonths: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function latestAvailableMonth(): string {
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return shiftMonth(thisMonth, -1);
}

const buttonBase =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 bg-card border border-card-border text-muted-foreground hover:text-foreground";

interface MemberInsightsViewProps {
  role: "admin" | "owner";
  initialMonth: string;
  initialGym: GymName | null;
  initialSummary: MemberInsightsSummary;
}

export function MemberInsightsView({ role, initialMonth, initialGym, initialSummary }: MemberInsightsViewProps) {
  const [month, setMonth] = useState(initialMonth);
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [summary, setSummary] = useState<MemberInsightsSummary | null>(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const latestMonth = latestAvailableMonth();

  function refetch(nextMonth: string, nextGym: GymName | null) {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ month: nextMonth });
        if (role === "admin" && nextGym) params.set("gym", nextGym);

        const res = await fetch(`/api/members/summary?${params.toString()}`);
        const body = await res.json();
        if (body.status !== "ok") {
          setSummary(null);
          setError(body.message ?? "Could not load member data.");
          return;
        }
        setSummary(body.summary);
      } catch {
        setSummary(null);
        setError("Something went wrong. Try again.");
      }
    });
  }

  function handleMonthChange(next: string) {
    setMonth(next);
    refetch(next, gym);
  }

  function handleGymChange(next: GymName | null) {
    setGym(next);
    refetch(month, next);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Members — {gym ?? "All gyms"}</h1>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleMonthChange(shiftMonth(month, -1))}
          className={buttonBase}
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="min-w-32 text-center text-sm font-medium text-foreground">{formatMonthLabel(month)}</span>
        <button
          type="button"
          disabled={isPending || month >= latestMonth}
          onClick={() => handleMonthChange(shiftMonth(month, 1))}
          className={buttonBase}
          aria-label="Next month"
        >
          →
        </button>

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
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card-glass p-5">
              <p className="text-sm text-muted-foreground">Active members</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(summary.activeMemberCount)}</p>
              {summary.noAttendanceDataForGym && (
                <p className="mt-1 text-xs text-warning">No attendance data for this gym this month</p>
              )}
              {summary.gymsWithNoAttendanceData && summary.gymsWithNoAttendanceData.length > 0 && (
                <p className="mt-1 text-xs text-warning">
                  Excludes {summary.gymsWithNoAttendanceData.join(", ")} — no attendance data this month
                </p>
              )}
            </div>
            <div className="card-glass p-5">
              <p className="text-sm text-muted-foreground">Avg attendance / active member</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {summary.avgAttendancePerActiveMember !== null ? summary.avgAttendancePerActiveMember.toFixed(1) : "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card-glass p-5">
              <p className="text-sm font-semibold text-foreground">
                At-risk members — gone quiet 3+ months{" "}
                <span className="font-normal text-muted-foreground">({summary.atRiskMembers.length})</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sorted most-recoverable first — a member who lapsed 3 months ago is a far better retention call than
                one gone a year.
              </p>
              {/* Fixed height + scroll: this list can run into the hundreds
                  across all gyms, and left unbounded it stretches the whole
                  grid row (including the much shorter Top attenders card
                  beside it) to match. */}
              <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-normal">Name</th>
                      <th className="py-2 pr-3 text-right font-normal">Last visited</th>
                      <th className="py-2 text-right font-normal">Gone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.atRiskMembers.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-3 text-center text-muted-foreground">
                          No at-risk members
                        </td>
                      </tr>
                    )}
                    {summary.atRiskMembers.map((m) => (
                      <tr key={m.userMemberId} className="border-b border-card-border last:border-0">
                        <td className="py-2 pr-3">
                          <Link href={customerProfileHref(m.gym, m.name)} className="text-accent hover:underline">
                            {m.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {formatDate(m.lastAttended)}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums font-medium ${
                            m.daysSinceLastVisit >= 180 ? "text-danger" : "text-warning"
                          }`}
                        >
                          {formatDaysAgo(m.daysSinceLastVisit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card-glass p-5">
              <p className="text-sm font-semibold text-foreground">Top attenders</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-card-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-normal">Rank</th>
                      <th className="py-2 pr-3 font-normal">Name</th>
                      <th className="py-2 text-right font-normal">Visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topAttenders.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-3 text-center text-muted-foreground">
                          No attendance this month
                        </td>
                      </tr>
                    )}
                    {summary.topAttenders.map((m, i) => (
                      <tr key={m.userMemberId} className="border-b border-card-border last:border-0">
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-3">
                          <Link href={customerProfileHref(m.gym, m.name)} className="text-accent hover:underline">
                            {m.name}
                          </Link>
                        </td>
                        <td className="py-2 text-right tabular-nums text-foreground">{m.attendance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold text-foreground">Lifetime value</h2>
              <Link href="/members/directory" className="text-sm text-accent hover:underline">
                Browse full customer directory →
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Predictive estimate (avg monthly spend × average customer lifespan per gym) — a conservative floor,
              since cancellation dates for still-active members aren&apos;t available yet. Uses full purchase
              history, not scoped to the month filter above.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="card-glass p-5">
                <p className="text-sm text-muted-foreground">Average LTV</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {summary.ltv.averageLtv !== null ? formatGBP(summary.ltv.averageLtv) : "—"}
                </p>
              </div>
              <div className="card-glass p-5">
                <p className="text-sm text-muted-foreground">Affordable CAC (LTV ÷ 3)</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {summary.ltv.affordableCac !== null ? formatGBP(summary.ltv.affordableCac) : "—"}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LtvHistogramChart data={summary.ltv.distribution} />
              <TopLtvCustomersTable data={summary.ltv.topCustomers} showGym={gym === null} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
