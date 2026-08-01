"use client";

import { formatGBP, formatDate } from "@/lib/format";
import type { OutgoingTransaction } from "@/lib/data/outgoings";

export function OutgoingTransactionsTable({ transactions }: { transactions: OutgoingTransaction[] }) {
  if (transactions.length === 0) return null;

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Outgoing transactions ({transactions.length})</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Every transaction imported from a bank statement, so a one-off like a specific supplier or HMRC stays
        visible rather than disappearing into a category total.
      </p>
      <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Date</th>
              <th className="py-2 pr-3 font-normal">From</th>
              <th className="py-2 pr-3 font-normal">Category</th>
              <th className="py-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-card-border last:border-0">
                <td className="py-2 pr-3 text-muted-foreground">{formatDate(t.date)}</td>
                <td className="py-2 pr-3 text-foreground">{t.description}</td>
                <td className="py-2 pr-3 text-muted-foreground">{t.category}</td>
                <td className="py-2 text-right tabular-nums text-foreground">{formatGBP(t.amountGbp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
