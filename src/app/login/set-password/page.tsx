"use client";

import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth/auth-card";

const inputClass =
  "w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none";
const buttonClass =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (body.status === "ok") {
        // Hard navigation: for the recovery+already-enrolled-MFA path this
        // session just cleared an AAL2 challenge, and soft nav has proven
        // unreliable right after an auth-cookie change on this app (see
        // the MFA pages) — so don't risk the same silent hang here.
        window.location.href = "/dashboard";
        return;
      }
      setError(body.message ?? "Could not set password.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Set your password" subtitle="At least 12 characters, with upper, lower case and a number.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs text-muted-foreground">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-xs text-muted-foreground">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Saving..." : "Save and continue"}
        </button>
      </form>
    </AuthCard>
  );
}
