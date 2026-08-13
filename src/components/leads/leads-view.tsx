"use client";

import { useState, useTransition } from "react";
import type { GymName } from "@/lib/data/types";
import type { RecentLead } from "@/lib/data/marketing";
import { GymSelect } from "@/components/ui/gym-select";
import { LeadsTable } from "./leads-table";

interface LeadsViewProps {
  role: "admin" | "owner";
  initialGym: GymName | null;
  initialLeads: RecentLead[] | null;
}

export function LeadsView({ role, initialGym, initialLeads }: LeadsViewProps) {
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [leads, setLeads] = useState<RecentLead[] | null>(initialLeads);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextGym: GymName | null) {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (role === "admin" && nextGym) params.set("gym", nextGym);

        const res = await fetch(`/api/leads?${params.toString()}`);
        const body = await res.json();
        if (body.status !== "ok") {
          setError(body.message ?? "Could not load leads.");
          return;
        }
        setLeads(body.leads);
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  function handleGymChange(next: GymName | null) {
    setGym(next);
    refetch(next);
  }

  const targetGym = role === "owner" ? initialGym : gym;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Leads — {gym ?? "All gyms"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Move a lead through New Lead / Contacted / Trial as they progress.</p>

      {role === "admin" && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <GymSelect value={gym} onChange={handleGymChange} disabled={isPending} />
        </div>
      )}

      {isPending && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="mt-3 text-sm text-danger">
          {error} {!isPending && "Pick a filter above to retry."}
        </p>
      )}

      <div className="mt-4">
        {targetGym && leads ? (
          <LeadsTable
            gym={targetGym}
            leads={leads}
            isAdmin={role === "admin"}
            onStatusChanged={(id, status) =>
              setLeads((prev) => prev?.map((l) => (l.id === id ? { ...l, status } : l)) ?? prev)
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a gym to see its leads.</p>
        )}
      </div>
    </div>
  );
}
