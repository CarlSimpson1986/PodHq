import { formatGBP } from "@/lib/format";
import type { TopCustomer } from "@/lib/data/revenue";

export function TopCustomersTable({ data }: { data: TopCustomer[] }) {
  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">Top 10 customers</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Rank</th>
              <th className="py-2 pr-3 font-normal">Name</th>
              <th className="py-2 pr-3 text-right font-normal">Total</th>
              <th className="py-2 text-right font-normal">% of revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.name} className="border-b border-card-border last:border-0">
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="py-2 pr-3 text-foreground">{row.name}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(row.total)}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {row.percentOfTotal.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
