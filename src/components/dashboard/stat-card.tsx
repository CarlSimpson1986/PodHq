import Link from "next/link";
import { formatPercent } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: string;
  /** Signed % change vs a named prior period. Color = direction × whether up is good. */
  delta?: { percent: number; upIsGood?: boolean; comparisonLabel: string } | null;
  /** A caveat about the number's completeness/reliability — e.g. missing data for some gyms. */
  note?: string;
  /** Colors the value itself instead of a delta — e.g. Net P&L, which has no "prior period" to compare against but still reads as good/bad by sign. */
  tone?: "success" | "danger";
  /** Makes the whole card a link through to that area's full page. */
  href?: string;
}

export function StatCard({ label, value, delta, note, tone, href }: StatCardProps) {
  const deltaColor = !delta
    ? ""
    : (delta.percent >= 0) === (delta.upIsGood ?? true)
      ? "text-success"
      : "text-danger";

  const valueColor = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";

  const content = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueColor}`}>{value}</p>
      {delta && (
        <p className={`mt-1 text-xs ${deltaColor}`}>
          {formatPercent(delta.percent)} vs {delta.comparisonLabel}
        </p>
      )}
      {note && <p className="mt-1 text-xs text-warning">{note}</p>}
    </>
  );

  const className = `rounded-[12px] border border-card-border bg-card p-5${
    href ? " transition-colors hover:border-accent" : ""
  }`;

  if (href) {
    return (
      <Link href={href} className={`block ${className}`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
