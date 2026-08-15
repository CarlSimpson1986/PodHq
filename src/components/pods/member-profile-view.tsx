"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberProfile, MemberBooking } from "@/lib/data/pods";
import type { RefundableTransaction, RefundableTransactionType } from "@/lib/data/refunds";
import type { ActiveMembership, SavedPaymentMethod } from "@/lib/data/sales";
import type { CatalogItem } from "@/lib/data/catalog";
import { SellPanel } from "./sell-panel";

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

const BOOKING_STATUS_LABELS: Record<MemberBooking["status"], string> = {
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatAddress(profile: MemberProfile) {
  const parts = [profile.addressLine1, profile.addressLine2, profile.addressCity, profile.addressPostcode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Not provided";
}

export function MemberProfileView({
  profile,
  initialBookings,
  initialTransactions,
  initialMembership,
  savedPaymentMethod,
  creditPacks,
  membershipTiers,
}: {
  profile: MemberProfile;
  initialBookings: MemberBooking[];
  initialTransactions: RefundableTransaction[];
  initialMembership: ActiveMembership | null;
  savedPaymentMethod: SavedPaymentMethod | null;
  creditPacks: CatalogItem[];
  membershipTiers: CatalogItem[];
}) {
  const router = useRouter();
  const [transactions, setTransactions] = useState(initialTransactions);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [balance, setBalance] = useState(profile.creditBalance);
  const [membership, setMembership] = useState(initialMembership);
  const [grantAmount, setGrantAmount] = useState(1);
  const [granting, setGranting] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantError, setGrantError] = useState("");

  function rowKey(t: RefundableTransaction) {
    return `${t.type}:${t.id}`;
  }

  async function handleGrantCredit() {
    setGranting(true);
    setGrantError("");
    try {
      const res = await fetch("/api/pods/credits/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym: profile.gym, memberId: profile.id, amount: grantAmount }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setGrantError(body.message ?? "Could not grant credit.");
        return;
      }
      setBalance(body.newBalance);
      setGrantOpen(false);
      setGrantAmount(1);
    } catch {
      setGrantError("Something went wrong. Try again.");
    } finally {
      setGranting(false);
    }
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
      setTransactions((prev) => prev.map((row) => (rowKey(row) === key ? { ...row, refunded: true } : row)));
      setConfirmingId(null);
    } catch {
      setRowError((prev) => ({ ...prev, [key]: "Something went wrong. Try again." }));
    } finally {
      setRefundingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <button type="button" onClick={() => router.back()} className="text-xs text-muted-foreground hover:underline">
          &larr; Back
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">{profile.name}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {profile.gym} &middot; {balance} credit{balance === 1 ? "" : "s"}
            </span>
            {grantOpen ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-14 rounded-md border border-card-border bg-card px-2 py-1 text-xs text-foreground"
                  disabled={granting}
                />
                <button type="button" onClick={handleGrantCredit} disabled={granting} className={buttonClass}>
                  {granting ? "Granting..." : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGrantOpen(false);
                    setGrantError("");
                  }}
                  disabled={granting}
                  className={ghostButtonClass}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setGrantOpen(true)} className={buttonClass}>
                Grant credit
              </button>
            )}
          </div>
        </div>
        {grantError && <p className="mt-1 text-right text-xs text-danger">{grantError}</p>}
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {membership
            ? `${membership.tierName} membership${membership.isComp ? " (comp)" : ""}${membership.currentPeriodEnd ? ` · ends ${formatDate(membership.currentPeriodEnd)}` : ""}`
            : "No active membership"}
        </p>
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {savedPaymentMethod
            ? `Card on file: ${savedPaymentMethod.brand.toUpperCase()} •••• ${savedPaymentMethod.last4} (exp ${savedPaymentMethod.expMonth}/${savedPaymentMethod.expYear})`
            : "No card on file"}
        </p>
      </div>

      <div className="flex justify-end">
        <Suspense fallback={null}>
          <SellPanel
            memberId={profile.id}
            gym={profile.gym}
            hasActiveMembership={!!membership}
            hasSavedCard={!!savedPaymentMethod}
            creditPacks={creditPacks}
            membershipTiers={membershipTiers}
            onCompSuccess={({ newBalance, membership: newMembership }) => {
              if (newBalance !== undefined) setBalance(newBalance);
              if (newMembership) setMembership(newMembership);
            }}
          />
        </Suspense>
      </div>

      <section className="card-glass p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Profile</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Mobile number</dt>
            <dd className="text-foreground">{profile.mobileNumber ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Gender</dt>
            <dd className="text-foreground">{profile.gender ?? "Not provided"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Address</dt>
            <dd className="text-foreground">{formatAddress(profile)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Waiver signed</dt>
            <dd className="text-foreground">
              {profile.waiverSignedAt
                ? `${profile.waiverSignedName ?? profile.name}, ${formatDate(profile.waiverSignedAt)}`
                : "Not signed"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Member since</dt>
            <dd className="text-foreground">{formatDate(profile.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="card-glass p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Bookings</h2>
        {initialBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {initialBookings.map((b) => (
                <tr key={b.id} className="border-b border-card-border last:border-b-0">
                  <td className="py-2 tabular-nums text-foreground">{formatDate(b.slotStart)}</td>
                  <td className="py-2 text-muted-foreground">{BOOKING_STATUS_LABELS[b.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card-glass p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Payments</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Stripe-funded purchases for this member yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="py-2 font-medium">Date</th>
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
                    <td className="py-2 text-muted-foreground">{TYPE_LABELS[t.type]}</td>
                    <td className="py-2 tabular-nums text-foreground">{t.amountLabel}</td>
                    <td className="py-2">
                      {t.refunded ? (
                        <span className="text-xs text-muted-foreground">Refunded</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {!t.refunded && (
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
