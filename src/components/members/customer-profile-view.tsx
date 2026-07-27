import Link from "next/link";
import { formatGBP, formatDate, formatMonthLabel, formatNumber } from "@/lib/format";
import type { CustomerProfile } from "@/lib/data/members";
import type { GymName } from "@/lib/data/types";

const CATEGORY_LABEL: Record<"MEMBERSHIP" | "CREDIT_PACK", string> = {
  MEMBERSHIP: "Membership",
  CREDIT_PACK: "PAYG / Pack",
};

interface CustomerProfileViewProps {
  gym: GymName;
  name: string;
  profile: CustomerProfile | null;
}

export function CustomerProfileView({ gym, name, profile }: CustomerProfileViewProps) {
  return (
    <div>
      <Link href="/members/directory" className="text-sm text-accent hover:underline">
        ← Back to directory
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-foreground">{name}</h1>
      <p className="text-sm text-muted-foreground">{gym}</p>

      {!profile && (
        <p className="mt-6 text-sm text-muted-foreground">
          No customer record found for this name at {gym}.
        </p>
      )}

      {profile && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-[12px] border border-card-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Total spend</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatGBP(profile.totalSpend)}</p>
            </div>
            <div className="rounded-[12px] border border-card-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Avg / month</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatGBP(profile.avgMonthlySpend)}</p>
            </div>
            <div className="rounded-[12px] border border-card-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Active months</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatNumber(profile.activeMonths)}</p>
            </div>
            <div className="rounded-[12px] border border-card-border bg-card p-5">
              <p className="text-sm text-muted-foreground">LTV</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatGBP(profile.ltv)}</p>
            </div>
            <div className="rounded-[12px] border border-card-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Last active</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatMonthLabel(profile.lastActiveMonth)}</p>
            </div>
          </div>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-foreground">Transactions</h2>
            <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto rounded-[12px] border border-card-border bg-card p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">Date</th>
                    <th className="py-2 pr-3 font-normal">Item</th>
                    <th className="py-2 pr-3 font-normal">Category</th>
                    <th className="py-2 pr-3 text-right font-normal">Qty</th>
                    <th className="py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-muted-foreground">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                  {profile.transactions.map((t, i) => (
                    <tr key={i} className="border-b border-card-border last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{formatDate(t.date)}</td>
                      <td className="py-2 pr-3 text-foreground">{t.item}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{CATEGORY_LABEL[t.category]}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{t.quantitySold}</td>
                      <td className="py-2 text-right tabular-nums text-foreground">{formatGBP(t.amountIncTax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
            {!profile.attendance && (
              <p className="mt-2 text-sm text-muted-foreground">
                No attendance record found for this name — either this gym has no attendance data for the period
                (a known gap for some gyms), or the name doesn&apos;t match the attendance system&apos;s records.
              </p>
            )}
            {profile.attendance && (
              <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto rounded-[12px] border border-card-border bg-card p-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-normal">Month</th>
                      <th className="py-2 pr-3 text-right font-normal">Visits</th>
                      <th className="py-2 text-right font-normal">Last visited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.attendance.map((a) => (
                      <tr key={a.reportMonth} className="border-b border-card-border last:border-0">
                        <td className="py-2 pr-3 text-foreground">{formatMonthLabel(a.reportMonth)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-foreground">{a.attendance}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {a.lastAttended ? formatDate(a.lastAttended) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
