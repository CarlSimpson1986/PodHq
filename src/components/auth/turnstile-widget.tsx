"use client";

import { useEffect, useRef, useState } from "react";

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
 * Loads the Turnstile script via a plain DOM <script> tag, not next/script.
 * next/script's afterInteractive strategy was tried first and confirmed
 * broken on this Next.js version: it only ever inserts a <link rel="preload">
 * for the script and never the actual executing <script> tag, so
 * window.turnstile never gets defined and the submit button stays disabled
 * forever with no error — reproduced 100% of the time, in every browser and
 * in incognito, ruling out the earlier extension-interference theory that
 * motivated the switch to next/script in the first place. Manual
 * createElement/appendChild sidesteps Next's script-loading abstraction
 * entirely.
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Lazy initializer rather than setting this from inside the effect below
  // when the script turns out to already be loaded — a newer
  // eslint-plugin-react-hooks (pulled in by the 2026-08-16 dependency
  // upgrade) promotes synchronous setState-in-effect from warning to error.
  const [scriptReady, setScriptReady] = useState(() => typeof window !== "undefined" && !!window.turnstile);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (window.turnstile) return;

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => setScriptReady(true));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
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

  return <div ref={containerRef} />;
}
