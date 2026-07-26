import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getDashboardSummary, getRevenueTrend, getDefaultReportMonth, shiftMonth } from "@/lib/data/dashboard";
import { formatGBP, formatNumber, formatPercent, formatMonthLabel } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueByGymChart } from "@/components/dashboard/revenue-by-gym-chart";
import { RevenueTrendChart } from "@/components/dashboard/revenue-trend-chart";
import { GymDownAlerts } from "@/components/dashboard/gym-down-alerts";
import { ArpmByGym } from "@/components/dashboard/arpm-by-gym";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function DashboardPage() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-danger">Not signed in.</p>
      </main>
    );
  }

  const scope = await getGymScope(supabase, user.id);
  if (!scope) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">
          No gym or role is assigned to this account. Contact your admin.
        </p>
      </main>
    );
  }

  const month = getDefaultReportMonth();
  const summary = await getDashboardSummary(scope, month);
  const trend = await getRevenueTrend(scope.role === "owner" ? scope.gym : null, 12, month);

  const previousMonth = formatMonthLabel(shiftMonth(month, -1));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-accent">PodHQ</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            {scope.role === "admin" ? "All gyms" : scope.gym}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatMonthLabel(month)}</p>
        </div>
        <SignOutButton />
      </div>

      <section className="mt-6 rounded-[12px] border border-card-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Total revenue</p>
        <p className="mt-2 text-3xl font-semibold text-foreground">
          {formatGBP(summary.currentMonthRevenue)}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {summary.monthOverMonthPercent !== null && (
            <span className={summary.monthOverMonthPercent >= 0 ? "text-success" : "text-danger"}>
              {formatPercent(summary.monthOverMonthPercent)} vs {previousMonth}
            </span>
          )}
          {summary.yearOverYearPercent !== null && (
            <span className={summary.yearOverYearPercent >= 0 ? "text-success" : "text-danger"}>
              {formatPercent(summary.yearOverYearPercent)} vs same month last year
            </span>
          )}
        </div>
      </section>

      <div className={`mt-4 grid grid-cols-1 gap-4 ${scope.role === "owner" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <StatCard label="Transactions" value={formatNumber(summary.transactionCount)} />
        <StatCard
          label="Active members"
          value={formatNumber(summary.activeMemberCount)}
          note={
            summary.gymsWithNoAttendanceData && summary.gymsWithNoAttendanceData.length > 0
              ? `Excludes ${summary.gymsWithNoAttendanceData.join(", ")} — no attendance data this month`
              : undefined
          }
        />
        {scope.role === "owner" && (
          <StatCard
            label="Average revenue per member"
            value={
              summary.averageRevenuePerMember !== null
                ? formatGBP(summary.averageRevenuePerMember)
                : "—"
            }
          />
        )}
      </div>

      {scope.role === "admin" && summary.gymsDownAlert && summary.gymsDownAlert.length > 0 && (
        <div className="mt-4">
          <GymDownAlerts alerts={summary.gymsDownAlert} />
        </div>
      )}

      {scope.role === "admin" && summary.revenueByGym && (
        <div className="mt-4">
          <RevenueByGymChart data={summary.revenueByGym} />
        </div>
      )}

      {scope.role === "admin" && summary.arpmByGym && (
        <div className="mt-4">
          <ArpmByGym data={summary.arpmByGym} />
        </div>
      )}

      <div className="mt-4">
        <RevenueTrendChart data={trend} />
      </div>
    </main>
  );
}
