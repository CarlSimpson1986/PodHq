import { formatGBP } from "@/lib/format";
import type { PnlFigures, PnlTotals } from "@/lib/data/outgoings";

export function PnlByGymTable({ perGym, consolidated }: { perGym: PnlFigures[]; consolidated: PnlTotals }) {
  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">P&amp;L by gym</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Gym</th>
              <th className="py-2 pr-3 text-right font-normal">Revenue</th>
              <th className="py-2 pr-3 text-right font-normal">Outgoings</th>
              <th className="py-2 pr-3 text-right font-normal">Ad spend</th>
              <th className="py-2 text-right font-normal">Net P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {perGym.map((row) => (
              <tr key={row.gym} className="border-b border-card-border last:border-0">
                <td className="py-2 pr-3 text-foreground">{row.gym}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(row.revenue)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(row.outgoings)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(row.adSpend)}</td>
                <td
                  className={`py-2 text-right tabular-nums font-medium ${
                    row.net >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {formatGBP(row.net)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-3 text-foreground">All gyms (consolidated)</td>
              <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(consolidated.revenue)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                {formatGBP(consolidated.outgoings)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(consolidated.adSpend)}</td>
              <td
                className={`py-2 text-right tabular-nums ${
                  consolidated.net >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {formatGBP(consolidated.net)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
