"use client";

import { useState } from "react";
import Link from "next/link";
import { GymSelect } from "@/components/ui/gym-select";
import type { GymName } from "@/lib/data/types";
import type { RefundableTransaction, RefundableTransactionType } from "@/lib/data/refunds";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50";
const dangerButtonClass =
  "rounded-md border border-danger/50 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50";
const ghostButtonClass = "rounded-md border border-card-border px-3 py-1 text-xs text-muted-foreground";

const TYPE_LABELS: Record<RefundableTransactionType, string> = {
  credit_pack: "Credit pack",
  membership: "Membership",
  gift_voucher: "Gift voucher",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TransactionsView({
  role,
  initialGym,
  initialTransactions,
}: {
  role: "admin" | "owner";
  initialGym: GymName;
  initialTransactions: RefundableTransaction[];
}) {
  const [gym, setGym] = useState<GymName>(initialGym);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [loading, setLoading] = useState(false);

  // Which row's inline confirm panel is open — no native window.confirm,
  // same as podhq-client's cancel-session flow this mirrors.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowSuccess, setRowSuccess] = useState<Record<string, string>>({});

  function rowKey(t: RefundableTransaction) {
    return `${t.type}:${t.id}`;
  }

  async function refetch(nextGym: GymName) {
    setLoading(true);
    try {
      const res = await fetch(`/api/pods/transactions?gym=${encodeURIComponent(nextGym)}`);
      const body = await res.json();
      setTransactions(body.status === "ok" ? body.transactions : []);
    } finally {
      setLoading(false);
    }
  }

  function handleGymChange(next: GymName | null) {
    if (!next || role !== "admin") return;
    setGym(next);
    setConfirmingId(null);
    refetch(next);
  }

  async function handleRefund(t: RefundableTransaction) {
    const key = rowKey(t);
    setRefundingId(key);
    setRowError((prev) => ({ ...prev, [key]: "" }));
    try {
      const res = await fetch("/api/pods/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: t.type, id: t.id }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setRowError((prev) => ({ ...prev, [key]: body.message ?? "Could not issue refund." }));
        return;
      }
      setRowSuccess((prev) => ({ ...prev, [key]: "Refund issued." }));
      setConfirmingId(null);
      await refetch(gym);
    } catch {
      setRowError((prev) => ({ ...prev, [key]: "Something went wrong. Try again." }));
    } finally {
      setRefundingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/pods" className="text-xs text-muted-foreground hover:underline">
            &larr; Access
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Transactions</h1>
          <p className="text-xs text-muted-foreground">Recent Stripe-funded purchases — refunds are issued through Stripe.</p>
        </div>
        {role === "admin" ? (
          <GymSelect value={gym} onChange={handleGymChange} className="w-56" />
        ) : (
          <span className="text-sm text-muted-foreground">{gym}</span>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      <section className="rounded-lg border border-card-border bg-card p-4">
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No refundable transactions for this gym yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Member</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Amount</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const key = rowKey(t);
                const isConfirming = confirmingId === key;
                const isRefunding = refundingId === key;
                return (
                  <tr key={key} className="border-b border-card-border last:border-b-0">
                    <td className="py-2 tabular-nums text-foreground">{formatDate(t.createdAt)}</td>
                    <td className="py-2 text-foreground">{t.memberName}</td>
                    <td className="py-2 text-muted-foreground">{TYPE_LABELS[t.type]}</td>
                    <td className="py-2 tabular-nums text-foreground">{t.amountLabel}</td>
                    <td className="py-2">
                      {t.refunded ? (
                        <span className="text-xs text-muted-foreground">Refunded</span>
                      ) : rowSuccess[key] ? (
                        <span className="text-xs text-success">{rowSuccess[key]}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {!t.refunded && !rowSuccess[key] && (
                        <>
                          {isConfirming ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-warning">Refund the full amount?</span>
                              <button
                                type="button"
                                onClick={() => handleRefund(t)}
                                disabled={isRefunding}
                                className={dangerButtonClass}
                              >
                                {isRefunding ? "Refunding..." : "Confirm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(null)}
                                disabled={isRefunding}
                                className={ghostButtonClass}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setConfirmingId(key)} className={buttonClass}>
                              Refund
                            </button>
                          )}
                          {rowError[key] && <p className="mt-1 text-xs text-danger">{rowError[key]}</p>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
