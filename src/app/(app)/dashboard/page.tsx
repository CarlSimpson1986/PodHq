import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getDashboardSummary, getRevenueTrend, getDefaultReportMonth, shiftMonth } from "@/lib/data/dashboard";
import { getMemberHighlights } from "@/lib/data/members";
import { getPnlSummary, getOutgoingsHistory } from "@/lib/data/outgoings";
import { OUTGOING_CATEGORIES } from "@/lib/data/types";
import { formatGBP, formatNumber, formatPercent, formatMonthLabel } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { AtRiskPreview } from "@/components/dashboard/at-risk-preview";
import { RevenueByGymChart } from "@/components/dashboard/revenue-by-gym-chart";
import { RevenueTrendChart } from "@/components/dashboard/revenue-trend-chart";
import { GymDownAlerts } from "@/components/dashboard/gym-down-alerts";
import { ArpmByGym } from "@/components/dashboard/arpm-by-gym";
import { DigestCard } from "@/components/dashboard/digest-card";
import { getLatestDigest } from "@/lib/assist/digest";

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

  const scope = await getGymScope(user.id);
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

  if (scope.role === "owner") {
    const [memberHighlights, pnl, outgoingsHistory, digest] = await Promise.all([
      getMemberHighlights(scope.gym, month),
      getPnlSummary(scope, null, month),
      getOutgoingsHistory(scope.gym),
      getLatestDigest(scope.gym),
    ]);

    const enteredCategories = new Set(outgoingsHistory.map((row) => row.category));
    const missingOutgoingsCategories = OUTGOING_CATEGORIES.filter((c) => !enteredCategories.has(c));
    const net = pnl.single?.net ?? null;
    // Only show the digest if it's actually for the current report month —
    // a stale digest from a previous month presented without disclosure
    // would be a plausible-looking wrong answer, the exact failure mode
    // the rest of this feature is built to avoid.
    const currentDigest = digest && digest.reportMonth === month ? digest : null;

    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-xl font-semibold text-foreground">{scope.gym}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatMonthLabel(month)}</p>

        {currentDigest && (
          <div className="mt-6">
            <DigestCard text={currentDigest.summary} toolNames={currentDigest.toolNames} reportMonth={currentDigest.reportMonth} />
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Revenue"
            value={formatGBP(summary.currentMonthRevenue)}
            delta={
              summary.monthOverMonthPercent !== null
                ? { percent: summary.monthOverMonthPercent, comparisonLabel: formatMonthLabel(shiftMonth(month, -1)) }
                : null
            }
            href="/revenue"
          />
          <StatCard
            label="Active members"
            value={formatNumber(memberHighlights.activeCount)}
            note={!memberHighlights.hasAttendanceData ? "No attendance data this month" : undefined}
            href="/members"
          />
          <StatCard
            label="Net P&L this month"
            value={net !== null ? formatGBP(net) : "—"}
            tone={net !== null ? (net >= 0 ? "success" : "danger") : undefined}
            href="/outgoings"
          />
        </div>

        <div className="mt-4">
          <AtRiskPreview members={memberHighlights.topAtRisk} totalAtRisk={memberHighlights.atRiskCount} />
        </div>

        <div className="mt-4">
          <NeedsAttention
            missingOutgoingsCategories={missingOutgoingsCategories}
            hasAttendanceData={memberHighlights.hasAttendanceData}
          />
        </div>
      </div>
    );
  }

  const trend = await getRevenueTrend(null, 12, month);
  const previousMonth = formatMonthLabel(shiftMonth(month, -1));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-xl font-semibold text-foreground">All gyms</h1>
      <p className="mt-1 text-sm text-muted-foreground">{formatMonthLabel(month)}</p>

      <section className="mt-6 card-glass p-5">
        <p className="text-sm text-muted-foreground">Total revenue</p>
        <p className="mt-2 text-3xl font-semibold text-foreground">{formatGBP(summary.currentMonthRevenue)}</p>
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

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

      {summary.gymsDownAlert && summary.gymsDownAlert.length > 0 && (
        <div className="mt-4">
          <GymDownAlerts alerts={summary.gymsDownAlert} />
        </div>
      )}

      {summary.revenueByGym && (
        <div className="mt-4">
          <RevenueByGymChart data={summary.revenueByGym} />
        </div>
      )}

      {summary.arpmByGym && (
        <div className="mt-4">
          <ArpmByGym data={summary.arpmByGym} />
        </div>
      )}

      <div className="mt-4">
        <RevenueTrendChart data={trend} />
      </div>
    </div>
  );
}
