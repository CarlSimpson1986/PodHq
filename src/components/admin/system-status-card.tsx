import { formatNumber } from "@/lib/format";
import type { SystemStatus } from "@/lib/data/admin";

function formatSyncTimestamp(value: string | null): string {
  if (!value) return "No data yet";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

const TABLE_LABELS: Record<keyof SystemStatus["rowCounts"], string> = {
  Revenue: "Revenue",
  attendance: "Attendance",
  users_gyms: "Users",
  ad_spend: "Ad spend",
  gym_outgoings: "Outgoings",
};

export function SystemStatusCard({ status }: { status: SystemStatus }) {
  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">System status</p>
      <p className="mt-1 text-xs text-muted-foreground">
        &ldquo;Last sync&rdquo; is the most recent row inserted into Revenue or attendance — a proxy for when
        GymFlow/UiPath data last landed, not the export timestamp itself.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {(Object.keys(TABLE_LABELS) as (keyof SystemStatus["rowCounts"])[]).map((table) => (
          <div key={table}>
            <p className="text-sm text-muted-foreground">{TABLE_LABELS[table]} rows</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{formatNumber(status.rowCounts[table])}</p>
          </div>
        ))}
        <div>
          <p className="text-sm text-muted-foreground">Last sync</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{formatSyncTimestamp(status.lastSync)}</p>
        </div>
      </div>
    </div>
  );
}
