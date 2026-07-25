"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";

const inputClass =
  "w-full rounded-md border border-card-border bg-background px-3 py-2 text-center text-lg tracking-[0.5em] text-foreground focus:border-accent focus:outline-none";
const buttonClass =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

export default function MfaChallengePage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/mfa/factors")
      .then((res) => res.json())
      .then((body) => {
        if (body.factors?.[0]) setFactorId(body.factors[0].id);
        else setError("No authenticator found. Contact your admin.");
      })
      .catch(() => setError("Could not load your authenticator."));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId, code }),
      });
      const body = await res.json();
      if (body.status === "ok") {
        router.push("/dashboard");
      } else {
        setError(body.message ?? "Incorrect code. Try again.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Enter your code" subtitle="Open your authenticator app and enter the 6-digit code.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          className={inputClass}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={loading || !factorId || code.length !== 6} className={buttonClass}>
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>
    </AuthCard>
  );
}
