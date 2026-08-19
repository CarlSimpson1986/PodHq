"use client";

import { useCallback, useEffect, useState } from "react";
import type { GymName } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";

interface StripeConnectStatus {
  connected: boolean;
  onboardingComplete: boolean;
}

// Admin-only, same reasoning as ResendConfigView/BrevoConfigView — never
// rendered for an owner. gym is controlled by the shared selector in
// setup-shell.tsx.
export function StripeConnectView({ gym }: { gym: GymName | null }) {
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    if (!gym) {
      setStatus(null);
      return;
    }
    setLoading(true);
    fetch(`/api/setup/stripe-connect?gym=${encodeURIComponent(gym)}`)
      .then((res) => res.json())
      .then((body) => {
        if (body.status !== "ok") {
          setError(body.message ?? "Could not load the Stripe Connect status.");
          return;
        }
        setStatus(body.connectStatus);
      })
      .catch(() => setError("Something went wrong. Try again."))
      .finally(() => setLoading(false));
  }, [gym]);

  useEffect(() => {
    // Deferred a tick so load()'s own setState calls aren't reachable
    // synchronously from the effect body itself — same fix as
    // resend-config-view.tsx's own load effect.
    queueMicrotask(load);
  }, [load]);

  async function handleConnect() {
    if (!gym) return;
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/setup/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not start Stripe Connect onboarding.");
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Something went wrong. Try again.");
      setStarting(false);
    }
  }

  return (
    <section className="card-glass p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Payments (Stripe Connect)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Each gym gets its own Stripe account — own balance, own payouts, and the franchisee can refund their own
          clients directly. A gym with nothing connected stays on the shared platform account.
        </p>
      </div>

      {!gym ? (
        <p className="mt-3 text-sm text-muted-foreground">Select a gym above to manage its Stripe Connect account.</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="mt-3 flex items-center justify-between rounded-md border border-card-border p-3">
          <div className="text-sm">
            {status?.onboardingComplete ? (
              <p className="text-foreground">Connected — this gym&rsquo;s payments go to its own Stripe account.</p>
            ) : status?.connected ? (
              <p className="text-muted-foreground">Onboarding started but not finished — reconnect to continue.</p>
            ) : (
              <p className="text-muted-foreground">Not connected — using the shared platform account.</p>
            )}
          </div>
          {!status?.onboardingComplete && (
            <button type="button" onClick={handleConnect} disabled={starting} className={buttonClass}>
              {starting ? "Starting..." : status?.connected ? "Continue setup" : "Connect"}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
