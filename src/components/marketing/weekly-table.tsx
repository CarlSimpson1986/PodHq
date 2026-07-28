import { formatGBP, formatDate } from "@/lib/format";
import type { WeeklyAdSpend } from "@/lib/data/marketing";

export function WeeklyTable({ weeks }: { weeks: WeeklyAdSpend[] }) {
  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">Week by week ({weeks.length})</p>
      {weeks.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No ad spend uploaded yet.</p>
      ) : (
        <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Week starting</th>
                <th className="py-2 pr-3 text-right font-normal">Spend</th>
                <th className="py-2 pr-3 text-right font-normal">Clicks</th>
                <th className="py-2 pr-3 text-right font-normal">CPC</th>
                <th className="py-2 pr-3 text-right font-normal">Leads</th>
                <th className="py-2 text-right font-normal">CPL</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((row) => (
                <tr key={row.weekStarting} className="border-b border-card-border last:border-0">
                  <td className="py-2 pr-3 text-foreground">{formatDate(row.weekStarting)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(row.spendGbp)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.clicks}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {row.cpc !== null ? formatGBP(row.cpc) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.leads}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {row.cpl !== null ? formatGBP(row.cpl) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
