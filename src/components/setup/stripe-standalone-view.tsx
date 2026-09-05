"use client";

import { useCallback, useEffect, useState } from "react";
import type { GymName } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass = "rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

interface StripeStandaloneConfigSummary {
  hasKey: boolean;
  updatedAt: string | null;
  publishableKey: string | null;
}

// Admin-only, same reasoning as ResendConfigView/BrevoConfigView. For an
// owned gym (e.g. Hove) that has its own real Stripe account rather than
// being a franchisee onboarded via Connect (see StripeConnectView) — the
// two are independent, a gym only ever uses one or the other.
export function StripeStandaloneConfigView({ gym }: { gym: GymName | null }) {
  const [config, setConfig] = useState<StripeStandaloneConfigSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setEditing(false);
    if (!gym) {
      setConfig(null);
      return;
    }
    setLoading(true);
    fetch(`/api/setup/stripe-standalone?gym=${encodeURIComponent(gym)}`)
      .then((res) => res.json())
      .then((body) => {
        if (body.status !== "ok") {
          setError(body.message ?? "Could not load the Stripe config.");
          return;
        }
        setConfig(body.config);
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

  async function handleSave() {
    if (!gym) return;
    if (!apiKey.trim() && !webhookSecret.trim() && !publishableKey.trim()) {
      setError("Enter at least one field to update.");
      return;
    }
    if (!config?.hasKey && (!apiKey.trim() || !webhookSecret.trim())) {
      setError("The secret key and webhook secret are required the first time this gym is configured.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/setup/stripe-standalone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gym,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(webhookSecret.trim() ? { webhookSecret: webhookSecret.trim() } : {}),
          ...(publishableKey.trim() ? { publishableKey: publishableKey.trim() } : {}),
        }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not save this config.");
        return;
      }
      setApiKey("");
      setWebhookSecret("");
      setPublishableKey("");
      setEditing(false);
      load();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card-glass p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Payments — standalone account (owned gyms)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          For a gym you own outright rather than a franchisee — its own real Stripe account, used directly. Key and
          webhook secret are stored encrypted and never shown again once saved. Separate from Stripe Connect above;
          a gym only ever uses one or the other.
        </p>
      </div>

      {!gym ? (
        <p className="mt-3 text-sm text-muted-foreground">Select a gym above to manage its standalone Stripe config.</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="mt-3">
          {!editing ? (
            <div className="flex items-center justify-between rounded-md border border-card-border p-3">
              <div className="text-sm">
                {config?.hasKey ? (
                  <>
                    <p className="text-foreground">•••• configured</p>
                    {config.publishableKey && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Publishable key: {config.publishableKey}</p>
                    )}
                    {config.updatedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Last updated {new Date(config.updatedAt).toLocaleDateString("en-GB")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Not connected.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPublishableKey(config?.publishableKey ?? "");
                  setEditing(true);
                }}
                className={secondaryButtonClass}
              >
                {config?.hasKey ? "Replace key" : "Add key"}
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-card-border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="password"
                  placeholder={config?.hasKey ? "Secret key (leave blank to keep current)" : "Stripe secret key (sk_live_...)"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  className={inputClass}
                />
                <input
                  type="password"
                  placeholder={config?.hasKey ? "Webhook secret (leave blank to keep current)" : "Webhook signing secret (whsec_...)"}
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  autoComplete="off"
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Publishable key (pk_live_...)"
                  value={publishableKey}
                  onChange={(e) => setPublishableKey(e.target.value)}
                  autoComplete="off"
                  className={`${inputClass} sm:col-span-2`}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Publishable key isn&apos;t secret — it&apos;s needed so the embedded checkout the member fills in loads
                against this gym&apos;s own Stripe account, not the shared platform one.
                {config?.hasKey && " Secret key and webhook secret are pre-existing — leave them blank to keep as-is."}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={handleSave} disabled={saving} className={buttonClass}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setApiKey("");
                    setWebhookSecret("");
                    setPublishableKey("");
                    setError(null);
                  }}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
