import Link from "next/link";
import { formatDate, formatDaysAgo, customerProfileHref } from "@/lib/format";
import type { AtRiskMember } from "@/lib/data/members";

interface AtRiskPreviewProps {
  members: AtRiskMember[];
  totalAtRisk: number;
}

export function AtRiskPreview({ members, totalAtRisk }: AtRiskPreviewProps) {
  if (members.length === 0) return null;

  return (
    <div className="rounded-[12px] border border-warning/40 bg-card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-semibold text-foreground">
          <span className="text-warning">{totalAtRisk} members gone quiet</span> — most recoverable first
        </p>
        <Link href="/members" className="text-sm text-accent hover:underline">
          View all {totalAtRisk} →
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Visited within the last 12 months, but not in the last 3 — a call today is a much better shot than waiting.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Name</th>
              <th className="py-2 pr-3 text-right font-normal">Last visited</th>
              <th className="py-2 text-right font-normal">Gone</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userMemberId} className="border-b border-card-border last:border-0">
                <td className="py-2 pr-3">
                  <Link href={customerProfileHref(m.gym, m.name)} className="text-accent hover:underline">
                    {m.name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{formatDate(m.lastAttended)}</td>
                <td
                  className={`py-2 text-right tabular-nums font-medium ${
                    m.daysSinceLastVisit >= 180 ? "text-danger" : "text-warning"
                  }`}
                >
                  {formatDaysAgo(m.daysSinceLastVisit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
