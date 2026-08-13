"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { LEAD_STATUSES, type GymName, type LeadStatus } from "@/lib/data/types";
import type { RecentLead } from "@/lib/data/marketing";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  trial: "Trial",
};

interface LeadsTableProps {
  gym: GymName;
  leads: RecentLead[];
  isAdmin: boolean;
  onStatusChanged: (id: number, status: LeadStatus) => void;
}

export function LeadsTable({ gym, leads, isAdmin, onStatusChanged }: LeadsTableProps) {
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (leads.length === 0) {
    return <p className="text-sm text-muted-foreground">No leads for this gym yet.</p>;
  }

  async function handleChange(id: number, status: LeadStatus) {
    setError(null);
    setSavingId(id);
    try {
      const params = new URLSearchParams();
      if (isAdmin) params.set("gym", gym);

      const res = await fetch(`/api/leads/${id}?${params.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not update this lead.");
        return;
      }
      onStatusChanged(id, status);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Leads ({leads.length})</p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Date</th>
              <th className="py-2 pr-3 font-normal">Name</th>
              <th className="py-2 pr-3 font-normal">Email</th>
              <th className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-card-border last:border-0">
                <td className="py-2 pr-3 text-muted-foreground">{formatDate(lead.createdDate)}</td>
                <td className="py-2 pr-3 text-foreground">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{lead.email}</td>
                <td className="py-2">
                  <select
                    value={lead.status}
                    disabled={savingId === lead.id}
                    onChange={(e) => handleChange(lead.id, e.target.value as LeadStatus)}
                    className="rounded-md border border-card-border bg-card px-2 py-1 text-xs text-foreground disabled:opacity-50"
                  >
                    {LEAD_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
