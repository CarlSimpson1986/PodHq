import Link from "next/link";
import { formatGBP, formatMonthLabel, customerProfileHref } from "@/lib/format";
import type { LtvCustomer } from "@/lib/data/members";

export function TopLtvCustomersTable({ data, showGym }: { data: LtvCustomer[]; showGym: boolean }) {
  const columnCount = showGym ? 7 : 6;

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Top 20 LTV customers</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Only customers with a purchase in the last 3 months are shown — someone who&apos;s since left won&apos;t
        appear here even if their historical spend was high. The average LTV and affordable CAC above still
        reflect every customer who&apos;s ever paid, including ones who&apos;ve since churned.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Rank</th>
              <th className="py-2 pr-3 font-normal">Name</th>
              {showGym && <th className="py-2 pr-3 font-normal">Gym</th>}
              <th className="py-2 pr-3 text-right font-normal">Avg / month</th>
              <th className="py-2 pr-3 text-right font-normal">Active months</th>
              <th className="py-2 pr-3 text-right font-normal">Last active</th>
              <th className="py-2 text-right font-normal">LTV</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="py-3 text-center text-muted-foreground">
                  Not enough customer history yet.
                </td>
              </tr>
            )}
            {data.map((row, i) => (
              <tr key={`${row.gym}-${row.name}`} className="border-b border-card-border last:border-0">
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="py-2 pr-3">
                  <Link href={customerProfileHref(row.gym, row.name)} className="text-accent hover:underline">
                    {row.name}
                  </Link>
                </td>
                {showGym && <td className="py-2 pr-3 text-muted-foreground">{row.gym}</td>}
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(row.avgMonthlySpend)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.activeMonths}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                  {formatMonthLabel(row.lastActiveMonth)}
                </td>
                <td className="py-2 text-right tabular-nums font-medium text-foreground">{formatGBP(row.ltv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
