"use client";

import { useState } from "react";
import type { GymName } from "@/lib/data/types";
import { GymSelect } from "@/components/ui/gym-select";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass = "rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

interface BrevoConfigSummary {
  hasKey: boolean;
  listId: number | null;
  updatedAt: string | null;
}

// Admin-only (see the note on /setup's page.tsx) — no role prop, this is
// never rendered for an owner.
export function BrevoConfigView({
  initialGym,
  initialConfig,
}: {
  initialGym: GymName | null;
  initialConfig: BrevoConfigSummary | null;
}) {
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [config, setConfig] = useState<BrevoConfigSummary | null>(initialConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [listId, setListId] = useState("");
  const [saving, setSaving] = useState(false);

  function load(nextGym: GymName | null) {
    setError(null);
    setEditing(false);
    if (!nextGym) {
      setConfig(null);
      return;
    }
    setLoading(true);
    fetch(`/api/setup/brevo?gym=${encodeURIComponent(nextGym)}`)
      .then((res) => res.json())
      .then((body) => {
        if (body.status !== "ok") {
          setError(body.message ?? "Could not load the Brevo config.");
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
    const listIdNum = Number(listId);
    if (!apiKey.trim() || !Number.isInteger(listIdNum) || listIdNum <= 0) {
      setError("Enter the account's API key and a valid list ID.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/setup/brevo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, apiKey: apiKey.trim(), listId: listIdNum }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not save this config.");
        return;
      }
      setApiKey("");
      setListId("");
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
          <h2 className="text-sm font-semibold text-foreground">Email marketing (Brevo)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each gym has its own Brevo account — key and list ID are stored encrypted and never shown again once saved.
          </p>
        </div>
        <GymSelect value={gym} onChange={handleGymChange} disabled={loading} />
      </div>

      {!gym ? (
        <p className="mt-3 text-sm text-muted-foreground">Select a gym above to manage its Brevo config.</p>
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
                      •••• configured &middot; list ID {config.listId}
                    </p>
                    {config.updatedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Last updated {new Date(config.updatedAt).toLocaleDateString("en-GB")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">No Brevo account connected for this gym yet.</p>
                )}
              </div>
              <button type="button" onClick={() => setEditing(true)} className={secondaryButtonClass}>
                {config?.hasKey ? "Replace key" : "Connect"}
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-card-border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="password"
                  placeholder="Brevo API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  className={inputClass}
                />
                <input
                  type="number"
                  placeholder="List ID"
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
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
                    setListId("");
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
