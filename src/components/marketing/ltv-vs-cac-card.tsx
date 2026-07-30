import { formatGBP } from "@/lib/format";
import type { MarketingSummary } from "@/lib/data/marketing";

export function LtvVsCacCard({ ltvVsCac }: { ltvVsCac: MarketingSummary["ltvVsCac"] }) {
  const { averageLtv, costPerLead, roiMultiple } = ltvVsCac;
  const hasData = averageLtv !== null && costPerLead !== null && roiMultiple !== null;

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">LTV vs. cost per lead</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Average member LTV</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{averageLtv !== null ? formatGBP(averageLtv) : "—"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Cost per lead</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{costPerLead !== null ? formatGBP(costPerLead) : "—"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">ROI</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {roiMultiple !== null ? `${roiMultiple.toFixed(1)}:1` : "—"}
          </p>
        </div>
      </div>

      {hasData ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Your average member is worth {formatGBP(averageLtv)}, and you&apos;re spending {formatGBP(costPerLead)} per
          lead — a {roiMultiple.toFixed(1)}:1 return.
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Not enough spend/lead data yet to show a return figure.
        </p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        &ldquo;Cost per lead&rdquo; is total spend ÷ total leads, not a confirmed cost per paying member — GymFlow
        doesn&apos;t currently expose which leads went on to become members, so this is the closest available proxy
        for CAC.
      </p>
    </div>
  );
}
