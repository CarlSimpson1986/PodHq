"use client";

import { useState, type FormEvent } from "react";
import { GYM_NAMES, type GymName } from "@/lib/data/types";

const inputClass =
  "w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none";
const buttonClass =
  "rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

export function CreateOwnerForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [gym, setGym] = useState<GymName>(GYM_NAMES[0]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setCopied(false);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, gym }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not create this account.");
        return;
      }
      setCreated({ email, password: body.password });
      setEmail("");
      onCreated();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.password);
    setCopied(true);
  }

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Add a new franchisee owner</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Creates their login directly — PodHQ doesn&apos;t send anything. Copy the one-time password below and send it
        to them yourself. They&apos;ll only have access to the gym selected below.
      </p>

      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <div className="flex-1">
          <label htmlFor="owner-email" className="mb-1 block text-xs text-muted-foreground">
            Email
          </label>
          <input
            id="owner-email"
            type="email"
            required
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
          />
        </div>
        <div>
          <label htmlFor="owner-gym" className="mb-1 block text-xs text-muted-foreground">
            Gym
          </label>
          <select
            id="owner-gym"
            value={gym}
            onChange={(e) => setGym(e.target.value as GymName)}
            className="rounded-md border border-card-border bg-background px-2 py-2 text-sm text-foreground"
          >
            {GYM_NAMES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={saving} className={buttonClass}>
          {saving ? "Creating..." : "Create account"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {created && (
        <div className="mt-3 rounded-md border border-card-border bg-background p-3 text-sm">
          <p className="text-foreground">
            Account created for <span className="font-semibold">{created.email}</span>. Send them this password
            yourself — nothing has been emailed.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 select-all rounded bg-card-border/30 px-2 py-1 font-mono text-xs text-foreground">
              {created.password}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md border border-card-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-card-border/20"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
