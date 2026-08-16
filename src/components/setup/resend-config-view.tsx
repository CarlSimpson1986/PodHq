"use client";

import { useState } from "react";
import type { GymName } from "@/lib/data/types";
import { GymSelect } from "@/components/ui/gym-select";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass = "rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

interface ResendConfigSummary {
  hasKey: boolean;
  fromAddress: string | null;
  fromName: string | null;
  updatedAt: string | null;
}

// Admin-only, same reasoning as BrevoConfigView — never rendered for an
// owner.
export function ResendConfigView({
  initialGym,
  initialConfig,
}: {
  initialGym: GymName | null;
  initialConfig: ResendConfigSummary | null;
}) {
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [config, setConfig] = useState<ResendConfigSummary | null>(initialConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [saving, setSaving] = useState(false);

  function load(nextGym: GymName | null) {
    setError(null);
    setEditing(false);
    if (!nextGym) {
      setConfig(null);
      return;
    }
    setLoading(true);
    fetch(`/api/setup/resend?gym=${encodeURIComponent(nextGym)}`)
      .then((res) => res.json())
      .then((body) => {
        if (body.status !== "ok") {
          setError(body.message ?? "Could not load the Resend config.");
          return;
        }
        setConfig(body.config);
      })
      .catch(() => setError("Something went wrong. Try again."))
      .finally(() => setLoading(false));
  }

  function handleGymChange(next: GymName | null) {
    setGym(next);
    load(next);
  }

  async function handleSave() {
    if (!gym) return;
    if (!apiKey.trim() || !fromAddress.trim() || !fromName.trim()) {
      setError("Enter the account's API key, from address, and from name.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/setup/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, apiKey: apiKey.trim(), fromAddress: fromAddress.trim(), fromName: fromName.trim() }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not save this config.");
        return;
      }
      setApiKey("");
      setFromAddress("");
      setFromName("");
      setEditing(false);
      load(gym);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card-glass p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Transactional email (Resend)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each gym has its own Resend account and quota. Key is stored encrypted and never shown again once saved.
            A gym with nothing connected falls back to the shared default account rather than failing to send.
          </p>
        </div>
        <GymSelect value={gym} onChange={handleGymChange} disabled={loading} />
      </div>

      {!gym ? (
        <p className="mt-3 text-sm text-muted-foreground">Select a gym above to manage its Resend config.</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="mt-3">
          {!editing ? (
            <div className="flex items-center justify-between rounded-md border border-card-border p-3">
              <div className="text-sm">
                {config?.hasKey ? (
                  <>
                    <p className="text-foreground">
                      •••• configured &middot; {config.fromName} &lt;{config.fromAddress}&gt;
                    </p>
                    {config.updatedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Last updated {new Date(config.updatedAt).toLocaleDateString("en-GB")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">No Resend account connected — using the shared default.</p>
                )}
              </div>
              <button type="button" onClick={() => setEditing(true)} className={secondaryButtonClass}>
                {config?.hasKey ? "Replace key" : "Connect"}
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-card-border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="password"
                  placeholder="Resend API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  className={inputClass}
                />
                <input
                  type="email"
                  placeholder="From address (e.g. hello@gym.co.uk)"
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="From name (e.g. My Fit Pod — Aylesbury)"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleSave} disabled={saving} className={buttonClass}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setApiKey("");
                    setFromAddress("");
                    setFromName("");
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
