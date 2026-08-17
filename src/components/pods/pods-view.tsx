"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GymSelect } from "@/components/ui/gym-select";
import type { GymName } from "@/lib/data/types";
import type { AccessEvent } from "@/lib/data/pods";

// Access events poll rather than push (no websocket/Realtime plumbing
// elsewhere in this app) — 15s keeps the log feeling "live" for the
// door-entry use case without adding new infrastructure.
const ACCESS_POLL_INTERVAL_MS = 15_000;

type AccessFilter = "all" | "success" | "blocked";

function todayDateParam(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatEventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const inputClass = "rounded-md border border-card-border bg-background px-2 py-1.5 text-sm text-foreground";

export function PodsView({
  role,
  initialGym,
  initialDate,
  initialAccessEvents,
}: {
  role: "admin" | "owner";
  initialGym: GymName;
  initialDate: string;
  initialAccessEvents: AccessEvent[];
}) {
  const [gym, setGym] = useState<GymName>(initialGym);
  const [date, setDate] = useState(initialDate);
  const [accessEvents, setAccessEvents] = useState(initialAccessEvents);
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [loading, setLoading] = useState(false);

  async function fetchAccessEvents(nextGym: GymName, nextDate: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/pods/access-events?gym=${encodeURIComponent(nextGym)}&date=${nextDate}`);
      const body = await res.json();
      setAccessEvents(body.status === "ok" ? body.events : []);
    } finally {
      setLoading(false);
    }
  }

  // Only poll when viewing today — a past date's log is static, no point
  // re-fetching it every 15s.
  useEffect(() => {
    if (date !== todayDateParam()) return;
    const interval = setInterval(() => fetchAccessEvents(gym, date), ACCESS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [gym, date]);

  function handleGymChange(next: GymName | null) {
    if (!next || role !== "admin") return;
    setGym(next);
    fetchAccessEvents(next, date);
  }

  function handleDateChange(next: string) {
    setDate(next);
    fetchAccessEvents(gym, next);
  }

  const filteredAccessEvents = accessEvents.filter((e) => {
    if (accessFilter === "success") return e.success;
    if (accessFilter === "blocked") return !e.success;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Access</h1>
        <div className="flex items-center gap-2">
          {role === "admin" ? (
            <GymSelect value={gym} onChange={handleGymChange} className="w-56" />
          ) : (
            <span className="text-sm text-muted-foreground">{gym}</span>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <section className="card-glass p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Access log{date === todayDateParam() && <span className="ml-2 text-xs font-normal text-success">● Live</span>}
            </h2>
            <p className="text-xs text-muted-foreground">Who unlocked the pod door, and when, for {date}.</p>
          </div>
          <select
            value={accessFilter}
            onChange={(e) => setAccessFilter(e.target.value as AccessFilter)}
            className={inputClass}
          >
            <option value="all">All attempts</option>
            <option value="success">Successful only</option>
            <option value="blocked">Blocked only</option>
          </select>
        </div>
        {loading && <p className="mb-2 text-xs text-muted-foreground">Loading...</p>}
        {filteredAccessEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No access attempts for this date{accessFilter !== "all" ? " matching this filter" : ""}.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="py-2 font-medium">Time</th>
                <th className="py-2 font-medium">Member</th>
                <th className="py-2 font-medium">Room</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccessEvents.map((e) => (
                <tr key={e.id} className="border-b border-card-border last:border-b-0">
                  <td className="py-2 tabular-nums text-foreground">{formatEventTime(e.attemptedAt)}</td>
                  <td className="py-2">
                    <Link href={`/pods/members/${e.memberId}`} className="text-accent hover:underline">
                      {e.memberName}
                    </Link>
                  </td>
                  <td className="py-2 text-muted-foreground">{e.resourceLabel ?? "—"}</td>
                  <td className="py-2">
                    {e.success ? (
                      <span className="text-success">Entered</span>
                    ) : (
                      <span className="text-danger" title={e.kisiResponse ?? undefined}>
                        Blocked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
