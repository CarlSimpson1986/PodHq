import { formatPercent } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: string;
  /** Signed % change vs a named prior period. Color = direction × whether up is good. */
  delta?: { percent: number; upIsGood?: boolean; comparisonLabel: string } | null;
  /** A caveat about the number's completeness/reliability — e.g. missing data for some gyms. */
  note?: string;
}

export function StatCard({ label, value, delta, note }: StatCardProps) {
  const deltaColor = !delta
    ? ""
    : (delta.percent >= 0) === (delta.upIsGood ?? true)
      ? "text-success"
      : "text-danger";

  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {delta && (
        <p className={`mt-1 text-xs ${deltaColor}`}>
          {formatPercent(delta.percent)} vs {delta.comparisonLabel}
        </p>
      )}
      {note && <p className="mt-1 text-xs text-warning">{note}</p>}
    </div>
  );
}
