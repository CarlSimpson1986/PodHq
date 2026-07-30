"use client";

import { useState, useTransition } from "react";
import { formatMonthLabel } from "@/lib/format";
import type { GymName } from "@/lib/data/types";
import type { PnlSummary, OutgoingEntry } from "@/lib/data/outgoings";
import { PnlSummary as PnlSummaryTiles } from "./pnl-summary";
import { PnlByGymTable } from "./pnl-by-gym-table";
import { OutgoingsBreakdownTable } from "./outgoings-breakdown-table";
import { GymSelect } from "@/components/ui/gym-select";

// Duplicated rather than imported from lib/data/dashboard — that module is
// "server-only" and this is a client component.
function shiftMonth(month: string, deltaMonths: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function latestAvailableMonth(): string {
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return shiftMonth(thisMonth, -1);
}

const buttonBase =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 bg-card border border-card-border text-muted-foreground hover:text-foreground";

interface OutgoingsViewProps {
  role: "admin" | "owner";
  initialMonth: string;
  initialGym: GymName | null;
  initialSummary: PnlSummary;
  initialHistory: OutgoingEntry[] | null;
}

export function OutgoingsView({ role, initialMonth, initialGym, initialSummary, initialHistory }: OutgoingsViewProps) {
  const [month, setMonth] = useState(initialMonth);
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [summary, setSummary] = useState<PnlSummary | null>(initialSummary);
  const [history, setHistory] = useState<OutgoingEntry[] | null>(initialHistory);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const latestMonth = latestAvailableMonth();

  function refetch(nextMonth: string, nextGym: GymName | null) {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ month: nextMonth });
        if (role === "admin" && nextGym) params.set("gym", nextGym);

        const res = await fetch(`/api/outgoings/summary?${params.toString()}`);
        const body = await res.json();
        if (body.status !== "ok") {
          setSummary(null);
          setHistory(null);
          setError(body.message ?? "Could not load P&L data.");
          return;
        }
        setSummary(body.summary);
        setHistory(body.history);
      } catch {
        setSummary(null);
        setHistory(null);
        setError("Something went wrong. Try again.");
      }
    });
  }

  function handleMonthChange(next: string) {
    setMonth(next);
    refetch(next, gym);
  }

  function handleGymChange(next: GymName | null) {
    setGym(next);
    refetch(month, next);
  }

  const singleGym = role === "owner" ? initialGym : gym;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Outgoings &amp; P&amp;L — {singleGym ?? "All gyms"}</h1>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleMonthChange(shiftMonth(month, -1))}
          className={buttonBase}
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="min-w-32 text-center text-sm font-medium text-foreground">{formatMonthLabel(month)}</span>
        <button
          type="button"
          disabled={isPending || month >= latestMonth}
          onClick={() => handleMonthChange(shiftMonth(month, 1))}
          className={buttonBase}
          aria-label="Next month"
        >
          →
        </button>

        {role === "admin" && (
          <GymSelect value={gym} onChange={handleGymChange} disabled={isPending} className="ml-auto" />
        )}
      </div>

      {isPending && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="mt-3 text-sm text-danger">
          {error} {!isPending && "Pick a filter above to retry."}
        </p>
      )}

      {summary && (
        <div className="mt-4 space-y-4">
          {summary.single && <PnlSummaryTiles figures={summary.single} />}
          {summary.allGyms && (
            <>
              <PnlSummaryTiles figures={summary.allGyms.consolidated} />
              <PnlByGymTable perGym={summary.allGyms.perGym} consolidated={summary.allGyms.consolidated} />
            </>
          )}

          {summary.single && singleGym && history && (
            <OutgoingsBreakdownTable
              gym={singleGym}
              categoryBreakdown={summary.single.categoryBreakdown}
              history={history}
              isAdmin={role === "admin"}
              onSubmitted={() => refetch(month, gym)}
            />
          )}
        </div>
      )}
    </div>
  );
}
