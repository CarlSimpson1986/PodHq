"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth/auth-card";

const inputClass =
  "w-full rounded-md border border-card-border bg-background px-3 py-2 text-center text-lg tracking-[0.5em] text-foreground focus:border-accent focus:outline-none";
const buttonClass =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

export default function MfaSetupPage() {
  const enrolled = useRef(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (enrolled.current) return;
    enrolled.current = true;
    fetch("/api/auth/mfa/enroll", { method: "POST" })
      .then((res) => res.json())
      .then((body) => {
        if (body.status === "ok") {
          setFactorId(body.factorId);
          setQrCode(body.qrCode);
          setSecret(body.secret);
        } else {
          setError(body.message ?? "Could not start MFA enrolment.");
        }
      })
      .catch(() => setError("Could not start MFA enrolment."));
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
        // Hard navigation: this account's session cookie just changed AAL,
        // and the App Router's client-side transition can silently fail to
        // pick that up (soft nav to /dashboard hangs on this exact screen).
        window.location.href = "/dashboard";
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
    <AuthCard
      title="Set up two-factor authentication"
      subtitle="Admin accounts require an authenticator app (Google Authenticator, Authy, etc.)."
    >
      <div className="space-y-4">
        {qrCode ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase returns a one-time data: URI, not a static asset
          <img src={qrCode} alt="Scan this QR code with your authenticator app" className="mx-auto h-40 w-40 rounded bg-white p-2" />
        ) : (
          !error && <p className="text-sm text-muted-foreground">Loading QR code...</p>
        )}
        {secret && (
          <p className="break-all text-center text-xs text-muted-foreground">
            Can&apos;t scan? Enter this key manually: <span className="font-mono">{secret}</span>
          </p>
        )}
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
            placeholder="000000"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading || !factorId || code.length !== 6} className={buttonClass}>
            {loading ? "Verifying..." : "Verify and continue"}
          </button>
        </form>
      </div>
    </AuthCard>
  );
}
