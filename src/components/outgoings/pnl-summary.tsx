import { formatGBP } from "@/lib/format";
import type { PnlTotals } from "@/lib/data/outgoings";

export function PnlSummary({ figures }: { figures: PnlTotals }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="card-glass p-5">
        <p className="text-sm text-muted-foreground">Revenue</p>
        <p className="mt-2 text-xl font-semibold text-foreground">{formatGBP(figures.revenue)}</p>
      </div>
      <div className="card-glass p-5">
        <p className="text-sm text-muted-foreground">Outgoings</p>
        <p className="mt-2 text-xl font-semibold text-foreground">{formatGBP(figures.outgoings)}</p>
      </div>
      <div className="card-glass p-5">
        <p className="text-sm text-muted-foreground">Ad spend</p>
        <p className="mt-2 text-xl font-semibold text-foreground">{formatGBP(figures.adSpend)}</p>
      </div>
      <div className="card-glass p-5">
        <p className="text-sm text-muted-foreground">Net P&amp;L</p>
        <p className={`mt-2 text-xl font-semibold ${figures.net >= 0 ? "text-success" : "text-danger"}`}>
          {formatGBP(figures.net)}
        </p>
      </div>
    </div>
  );
}
