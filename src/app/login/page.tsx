"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";

const inputClass =
  "w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none";
const buttonClass =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";
const linkButtonClass = "text-sm text-muted-foreground underline hover:text-foreground";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic-link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (body.status === "ok") {
        router.push("/dashboard");
      } else if (body.status === "mfa_required") {
        router.push("/login/mfa");
      } else if (body.status === "mfa_setup_required") {
        router.push("/login/mfa-setup");
      } else {
        setError(body.message ?? "Something went wrong.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLinkSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      setInfo(body.message ?? "If an account exists for that email, a login link has been sent.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle={mode === "password" ? "Enter your email and password." : "We'll email you a login link."}
    >
      {mode === "password" ? (
        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          <div>
            <label htmlFor="email" className="mb-1 block text-xs text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs text-muted-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <button type="button" className={linkButtonClass} onClick={() => { setMode("magic-link"); setError(null); }}>
            Send me a login link instead
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleMagicLinkSubmit}>
          <div>
            <label htmlFor="magic-email" className="mb-1 block text-xs text-muted-foreground">
              Email
            </label>
            <input
              id="magic-email"
              type="email"
              autoComplete="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          {info && <p className="text-sm text-success">{info}</p>}
          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? "Sending..." : "Send login link"}
          </button>
          <button type="button" className={linkButtonClass} onClick={() => { setMode("password"); setError(null); setInfo(null); }}>
            Use a password instead
          </button>
        </form>
      )}
    </AuthCard>
  );
}
