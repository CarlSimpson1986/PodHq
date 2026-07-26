"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";

const inputClass =
  "w-full rounded-md border border-card-border bg-background px-3 py-2 text-center text-lg tracking-[0.5em] text-foreground focus:border-accent focus:outline-none";
const buttonClass =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

// Only ever set by our own auth/callback redirect (recovery + already-enrolled
// MFA needs the challenge cleared before Supabase will accept a password
// change) — allowlisted rather than trusted verbatim from the query string.
const ALLOWED_NEXT = new Set(["/login/set-password"]);

export default function MfaChallengePage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Enter your code" subtitle="Open your authenticator app and enter the 6-digit code.">
          <p className="text-sm text-muted-foreground">One moment...</p>
        </AuthCard>
      }
    >
      <MfaChallengeInner />
    </Suspense>
  );
}

function MfaChallengeInner() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const redirectTo = next && ALLOWED_NEXT.has(next) ? next : "/dashboard";

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
        // Hard navigation: this session's cookie just changed AAL, and the
        // App Router's client-side transition can silently fail to pick
        // that up (soft nav hangs on this exact screen).
        window.location.href = redirectTo;
        return;
      }
      setError(body.message ?? "Incorrect code. Try again.");
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
