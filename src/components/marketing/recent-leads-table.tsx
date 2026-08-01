"use client";

import { formatDate } from "@/lib/format";
import type { RecentLead } from "@/lib/data/marketing";

export function RecentLeadsTable({ leads }: { leads: RecentLead[] }) {
  if (leads.length === 0) return null;

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Recent leads ({leads.length})</p>
      <p className="mt-1 text-xs text-muted-foreground">
        From the GymFlow leads export — previously only counted toward the weekly total, now kept individually.
      </p>
      <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Date</th>
              <th className="py-2 pr-3 font-normal">Name</th>
              <th className="py-2 font-normal">Email</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-card-border last:border-0">
                <td className="py-2 pr-3 text-muted-foreground">{formatDate(lead.createdDate)}</td>
                <td className="py-2 pr-3 text-foreground">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="py-2 text-muted-foreground">{lead.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
