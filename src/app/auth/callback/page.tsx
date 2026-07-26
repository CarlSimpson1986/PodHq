"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Signing you in...">
          <p className="text-sm text-muted-foreground">One moment...</p>
        </AuthCard>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ran = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function run() {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hashError = hashParams.get("error");
      const type = hashParams.get("type") ?? searchParams.get("type");
      const code = searchParams.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (hashError || (!code && !(accessToken && refreshToken))) {
        setError(true);
        return;
      }

      try {
        const res = await fetch("/api/auth/complete-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            accessToken && refreshToken ? { accessToken, refreshToken } : { code }
          ),
        });
        const body = await res.json();

        if (body.status !== "ok") {
          setError(true);
          return;
        }

        if (type === "recovery" && body.nextStep === "mfa_required") {
          // Recovering an account that already has TOTP enrolled: Supabase
          // requires an AAL2 session before it'll accept a password change,
          // so the challenge has to happen before set-password, not after.
          router.push("/login/mfa?next=/login/set-password");
        } else if (type === "invite" || type === "recovery") {
          router.push("/login/set-password");
        } else if (body.nextStep === "mfa_setup_required") {
          router.push("/login/mfa-setup");
        } else if (body.nextStep === "mfa_required") {
          router.push("/login/mfa");
        } else {
          router.push("/dashboard");
        }
      } catch {
        setError(true);
      }
    }

    run();
  }, [router, searchParams]);

  return (
    <AuthCard title={error ? "Link expired" : "Signing you in..."}>
      {error ? (
        <p className="text-sm text-danger">
          This link is invalid or has expired.{" "}
          <a href="/login" className="underline">
            Back to sign in
          </a>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">One moment...</p>
      )}
    </AuthCard>
  );
}
