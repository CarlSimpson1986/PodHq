"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { formatGBP, formatMonthLabel, customerProfileHref } from "@/lib/format";
import type { GymName } from "@/lib/data/types";
import type { LtvCustomer } from "@/lib/data/members";
import { GymSelect } from "@/components/ui/gym-select";

interface CustomerDirectoryViewProps {
  role: "admin" | "owner";
  initialGym: GymName | null;
  initialCustomers: LtvCustomer[];
}

export function CustomerDirectoryView({ role, initialGym, initialCustomers }: CustomerDirectoryViewProps) {
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [customers, setCustomers] = useState<LtvCustomer[]>(initialCustomers);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGymChange(nextGym: GymName | null) {
    setGym(nextGym);
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (role === "admin" && nextGym) params.set("gym", nextGym);

        const res = await fetch(`/api/members/directory?${params.toString()}`);
        const body = await res.json();
        if (body.status !== "ok") {
          setCustomers([]);
          setError(body.message ?? "Could not load customer data.");
          return;
        }
        setCustomers(body.customers);
      } catch {
        setCustomers([]);
        setError("Something went wrong. Try again.");
      }
    });
  }

  // Filtered client-side against the list already in hand — no request per
  // keystroke, since the full scope's customers are already fetched.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(query));
  }, [customers, search]);

  const showGym = gym === null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Customer directory — {gym ?? "All gyms"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every customer who&apos;s ever paid at {gym ?? "any gym"} — search by name or click through to a profile.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full max-w-xs rounded-md border border-card-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground sm:w-64"
        />

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

      <div className="mt-4 card-glass p-5">
        <p className="text-sm font-semibold text-foreground">
          Customers <span className="font-normal text-muted-foreground">({filtered.length})</span>
        </p>
        <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Name</th>
                {showGym && <th className="py-2 pr-3 font-normal">Gym</th>}
                <th className="py-2 pr-3 text-right font-normal">Avg / month</th>
                <th className="py-2 pr-3 text-right font-normal">Active months</th>
                <th className="py-2 pr-3 text-right font-normal">Last active</th>
                <th className="py-2 text-right font-normal">LTV</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={showGym ? 6 : 5} className="py-3 text-center text-muted-foreground">
                    No customers match.
                  </td>
                </tr>
              )}
              {filtered.map((row) => (
                <tr key={`${row.gym}-${row.name}`} className="border-b border-card-border last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={customerProfileHref(row.gym, row.name)} className="text-accent hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  {showGym && <td className="py-2 pr-3 text-muted-foreground">{row.gym}</td>}
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(row.avgMonthlySpend)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.activeMonths}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {formatMonthLabel(row.lastActiveMonth)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium text-foreground">{formatGBP(row.ltv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
