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
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
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
      setSuccess(`Invite sent to ${email}.`);
      setEmail("");
      onCreated();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">Add a new franchisee owner</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Sends an email invite to set their own password. They&apos;ll only have access to the gym selected below.
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
          {saving ? "Sending..." : "Send invite"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {success && <p className="mt-3 text-sm text-accent">{success}</p>}
    </div>
  );
}
