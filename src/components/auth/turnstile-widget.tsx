"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * Loads the Turnstile script via next/script rather than a manually
 * created/appended <script> tag. The manual version silently failed in
 * production: a browser extension (same fdprocessedid-marking one that
 * stripped the login button's `disabled` attribute earlier) interfered with
 * the createElement/appendChild call itself, so the script never loaded and
 * the token never arrived — the login form's own submit guard then correctly
 * refused to submit, leaving the button permanently blocked with no error
 * shown. next/script's afterInteractive strategy uses Next's own
 * well-tested script-loading path instead of ad-hoc DOM manipulation, which
 * is far less likely to trigger that class of extension interference, and
 * it natively dedupes across this component's remounts (a fresh `key` is
 * used after every submit attempt so each attempt gets a single-use token).
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Covers the case where the script is already loaded from a previous
  // mount (next/script dedupes by src, so a remount's <Script> won't fire
  // onLoad again — this catches that and renders immediately instead).
  useEffect(() => {
    if (window.turnstile) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!scriptReady || !siteKey || !containerRef.current || !window.turnstile) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      "expired-callback": () => onToken(""),
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [scriptReady, siteKey, onToken]);

  if (!siteKey) return null;

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
      <div ref={containerRef} />
    </>
  );
}
