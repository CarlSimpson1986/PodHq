import { formatGBP, formatPercent } from "@/lib/format";
import type { DashboardAlert } from "@/lib/data/dashboard";

export function GymDownAlerts({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="rounded-[12px] border border-danger/40 bg-card p-5">
      <p className="text-sm font-semibold text-foreground">
        Gyms down more than 10% month-on-month
      </p>
      <ul className="mt-3 space-y-2">
        {alerts.map((alert) => (
          <li key={alert.gym} className="flex items-center gap-2 text-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-4 w-4 shrink-0 fill-danger"
            >
              <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
            </svg>
            <span className="text-foreground">{alert.gym}</span>
            <span className="text-danger">{formatPercent(alert.percentChange)}</span>
            <span className="ml-auto text-muted-foreground">
              {formatGBP(alert.total)} vs {formatGBP(alert.previousTotal)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
