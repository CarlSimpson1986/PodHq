"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import type { GymName } from "@/lib/data/types";
import type { ActiveMembership } from "@/lib/data/sales";
import type { CatalogItem } from "@/lib/data/catalog";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const ghostButtonClass = "rounded-md border border-card-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-50";
const inputClass = "rounded-md border border-card-border bg-card px-2 py-1 text-xs text-foreground";

type ItemType = "credit_pack" | "membership";
type PriceMode = "free" | "discount" | "full";

function formatGBP(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

export function SellPanel({
  memberId,
  gym,
  hasActiveMembership,
  hasSavedCard,
  creditPacks,
  membershipTiers,
  onCompSuccess,
}: {
  memberId: number;
  gym: GymName;
  hasActiveMembership: boolean;
  hasSavedCard: boolean;
  creditPacks: CatalogItem[];
  membershipTiers: CatalogItem[];
  onCompSuccess: (result: { newBalance?: number; membership?: ActiveMembership }) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<ItemType>("credit_pack");
  const [itemId, setItemId] = useState(creditPacks[0]?.itemId ?? "");
  const [priceMode, setPriceMode] = useState<PriceMode>("full");
  const [priceGBP, setPriceGBP] = useState(creditPacks[0]?.priceGBP ?? 0);
  const [discountMode, setDiscountMode] = useState<"ongoing" | "first_payment_only">("ongoing");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [savedCardCharged, setSavedCardCharged] = useState(false);

  // Stripe.js itself needs to know which connected account a Checkout
  // Session belongs to, separately from the server-side session creation —
  // a session created against Hove's account via `stripeAccount` 404s here
  // otherwise ("provided key does not have access to account..."), even
  // though the server-side call succeeded. Memoized on stripeAccountId
  // (only changes once, when a checkout starts) rather than recreated
  // every render, per Stripe's own guidance not to call loadStripe() on
  // every render.
  const stripePromise = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return null;
    return loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  }, [stripeAccountId]);

  const catalog = itemType === "credit_pack" ? creditPacks : membershipTiers;
  const selected = catalog.find((i) => i.itemId === itemId) ?? catalog[0];
  const fullPrice = selected?.priceGBP ?? 0;
  const blocked = itemType === "membership" && hasActiveMembership;

  function selectItemType(next: ItemType) {
    setItemType(next);
    const nextCatalog = next === "credit_pack" ? creditPacks : membershipTiers;
    setItemId(nextCatalog[0]?.itemId ?? "");
    setPriceGBP(nextCatalog[0]?.priceGBP ?? 0);
    setPriceMode("full");
    setError("");
  }

  function selectItem(nextId: string) {
    setItemId(nextId);
    const item = catalog.find((i) => i.itemId === nextId) ?? catalog[0];
    if (priceMode !== "discount" && item) setPriceGBP(item.priceGBP);
  }

  function selectPriceMode(mode: PriceMode) {
    setPriceMode(mode);
    if (mode === "full") setPriceGBP(fullPrice);
    if (mode === "discount") setPriceGBP(Math.max(0.01, fullPrice - 1));
  }

  async function handleGrantFree() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/pods/sales/comp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gym,
          memberId,
          type: itemType,
          itemId,
          ...(itemType === "membership" && endDate ? { endDate } : {}),
        }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not complete this.");
        return;
      }
      onCompSuccess({ newBalance: body.newBalance, membership: body.membership });
      setOpen(false);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStartCheckout() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/pods/sales/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gym,
          memberId,
          type: itemType,
          itemId,
          priceGBP,
          ...(itemType === "membership" ? { discountMode } : {}),
        }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not start checkout.");
        return;
      }
      setStripeAccountId(body.stripeAccountId ?? null);
      setClientSecret(body.clientSecret);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChargeSavedCard() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/pods/sales/charge-saved-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gym,
          memberId,
          type: itemType,
          itemId,
          priceGBP,
          ...(itemType === "membership" ? { discountMode } : {}),
        }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not charge the saved card.");
        return;
      }
      // Ledger write happens via podhq-client's webhook, same async gap as
      // the embedded-checkout return flow — refresh after a short delay
      // rather than assuming it's landed instantly.
      setSavedCardCharged(true);
      setTimeout(() => router.refresh(), 1500);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    setOpen(false);
    setClientSecret(null);
    setStripeAccountId(null);
    setError("");
  }

  // Return from the embedded Checkout's return_url — webhook processing is
  // async, so this doesn't assume the ledger write has landed yet; it just
  // confirms payment succeeded, then does a clean full reload so the page
  // re-fetches server-side data (balance/membership) fresh.
  const returningSessionId = searchParams.get("checkout_session_id");
  const [returnStatus, setReturnStatus] = useState<"checking" | "paid" | "not_paid" | null>(
    returningSessionId ? "checking" : null
  );

  useEffect(() => {
    if (!returningSessionId) return;
    let cancelled = false;

    fetch(`/api/pods/sales/checkout-status?memberId=${memberId}&sessionId=${encodeURIComponent(returningSessionId)}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.status === "ok" && body.paid) {
          setReturnStatus("paid");
          setTimeout(() => router.replace(pathname), 1500);
        } else {
          setReturnStatus("not_paid");
        }
      })
      .catch(() => {
        if (!cancelled) setReturnStatus("not_paid");
      });

    return () => {
      cancelled = true;
    };
  }, [returningSessionId, memberId, router, pathname]);

  if (savedCardCharged) {
    return (
      <section className="card-glass p-4">
        <p className="text-sm text-foreground">Card charged. Refreshing...</p>
      </section>
    );
  }

  if (returnStatus) {
    return (
      <section className="card-glass p-4">
        {returnStatus === "checking" && <p className="text-sm text-muted-foreground">Checking payment status...</p>}
        {returnStatus === "paid" && <p className="text-sm text-foreground">Payment received. Refreshing...</p>}
        {returnStatus === "not_paid" && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-danger">Payment wasn&apos;t completed.</p>
            <button type="button" onClick={() => router.replace(pathname)} className={ghostButtonClass}>
              Dismiss
            </button>
          </div>
        )}
      </section>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        Sell a pack or membership
      </button>
    );
  }

  return (
    <section className="card-glass space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Sell a pack or membership</h2>
        <button type="button" onClick={cancel} className={ghostButtonClass} disabled={submitting}>
          Close
        </button>
      </div>

      {clientSecret ? (
        <div className="min-h-[400px]">
          {stripePromise ? (
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : (
            <p className="text-sm text-danger">
              Stripe isn&apos;t configured (missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => selectItemType("credit_pack")}
              className={itemType === "credit_pack" ? buttonClass : ghostButtonClass}
            >
              Credit pack
            </button>
            <button
              type="button"
              onClick={() => selectItemType("membership")}
              className={itemType === "membership" ? buttonClass : ghostButtonClass}
            >
              Membership
            </button>
          </div>

          {blocked ? (
            <p className="text-sm text-warning">This member already has an active membership.</p>
          ) : (
            <>
              <select value={itemId} onChange={(e) => selectItem(e.target.value)} className={`${inputClass} w-full`}>
                {catalog.map((item) => (
                  <option key={item.itemId} value={item.itemId}>
                    {item.name} — {item.label} ({formatGBP(item.priceGBP)}
                    {itemType === "membership" ? "/mo" : ""})
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selectPriceMode("full")}
                  className={priceMode === "full" ? buttonClass : ghostButtonClass}
                >
                  Full price
                </button>
                <button
                  type="button"
                  onClick={() => selectPriceMode("discount")}
                  className={priceMode === "discount" ? buttonClass : ghostButtonClass}
                >
                  Discount
                </button>
                <button
                  type="button"
                  onClick={() => selectPriceMode("free")}
                  className={priceMode === "free" ? buttonClass : ghostButtonClass}
                >
                  Free
                </button>
              </div>

              {priceMode === "discount" && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Charge
                    <input
                      type="number"
                      min={0.01}
                      max={fullPrice}
                      step={0.01}
                      value={priceGBP}
                      onChange={(e) => setPriceGBP(Math.min(fullPrice, Math.max(0.01, Number(e.target.value) || 0.01)))}
                      className={`${inputClass} w-24`}
                    />
                    of {formatGBP(fullPrice)}
                  </label>
                  {itemType === "membership" && (
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setDiscountMode("ongoing")}
                        className={discountMode === "ongoing" ? buttonClass : ghostButtonClass}
                      >
                        Every payment
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountMode("first_payment_only")}
                        className={discountMode === "first_payment_only" ? buttonClass : ghostButtonClass}
                      >
                        First payment only
                      </button>
                    </div>
                  )}
                </div>
              )}

              {itemType === "membership" && priceMode === "free" && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Ends on (optional)
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
                </label>
              )}

              {error && <p className="text-xs text-danger">{error}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={priceMode === "free" ? handleGrantFree : handleStartCheckout}
                  disabled={submitting}
                  className={buttonClass}
                >
                  {submitting
                    ? "Working..."
                    : priceMode === "free"
                      ? "Grant for free"
                      : `Charge new card ${formatGBP(priceGBP)}${itemType === "membership" ? "/mo" : ""}`}
                </button>
                {priceMode !== "free" && hasSavedCard && (
                  <button type="button" onClick={handleChargeSavedCard} disabled={submitting} className={ghostButtonClass}>
                    {submitting ? "Working..." : `Charge card on file ${formatGBP(priceGBP)}${itemType === "membership" ? "/mo" : ""}`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
