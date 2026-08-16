"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

const CAPTCHA_TIMEOUT_MS = 8000;

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
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [captchaStuck, setCaptchaStuck] = useState(false);

  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    // A real (non-expiry) token means the widget isn't stuck — reset here,
    // in the callback that actually observed the change, rather than
    // unconditionally at the top of the effect below (a newer
    // eslint-plugin-react-hooks, pulled in by the 2026-08-16 dependency
    // upgrade, promotes synchronous setState-in-effect from warning to
    // error).
    if (token) setCaptchaStuck(false);
  }, []);

  // The widget failing to load is otherwise silent — the submit button just
  // stays disabled forever with no explanation, which is exactly what made
  // a real production incident look like "the button doesn't work" with no
  // clue why. If no token has arrived within a few seconds, say so and
  // suggest the one workaround that's actually been confirmed to help
  // (browser extensions interfering with the widget's own script load).
  useEffect(() => {
    if (captchaToken) return;
    const timer = setTimeout(() => setCaptchaStuck(true), CAPTCHA_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [captchaKey, captchaToken]);

  // Turnstile tokens are single-use — remount the widget after every attempt
  // (success or failure) so the next submit has a fresh one.
  function resetCaptcha() {
    setCaptchaToken("");
    setCaptchaStuck(false);
    setCaptchaKey((k) => k + 1);
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!captchaToken) {
      setError("Verification is still loading. Wait a moment and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken }),
      });
      const body = await res.json();
      if (body.status === "ok") {
        router.push("/dashboard");
      } else if (body.status === "password_change_required") {
        router.push("/login/set-password");
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
      resetCaptcha();
    }
  }

  async function handleMagicLinkSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!captchaToken) {
      setError("Verification is still loading. Wait a moment and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      });
      const body = await res.json();
      setInfo(body.message ?? "If an account exists for that email, a login link has been sent.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
      resetCaptcha();
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
          <TurnstileWidget key={captchaKey} onToken={handleCaptchaToken} />
          {captchaStuck && !error && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              Verification is taking longer than expected. This is sometimes caused by a browser extension
              (particularly password managers or ad blockers) — try disabling extensions for this site, or open
              this page in a private/incognito window.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading || !captchaToken} className={buttonClass}>
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
          <TurnstileWidget key={captchaKey} onToken={handleCaptchaToken} />
          {captchaStuck && !error && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              Verification is taking longer than expected. This is sometimes caused by a browser extension
              (particularly password managers or ad blockers) — try disabling extensions for this site, or open
              this page in a private/incognito window.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          {info && <p className="text-sm text-success">{info}</p>}
          <button type="submit" disabled={loading || !captchaToken} className={buttonClass}>
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
