import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const isDev = process.env.NODE_ENV === "development";

// Nonce-based CSP, not next.config's old static header + 'unsafe-inline'.
// 'unsafe-inline' was diagnosed live as the only thing standing between a
// broken login page and a working one: Next's own inline hydration scripts
// (the __next_f.push(...) RSC payload) were getting silently blocked by
// CSP with no console violation shown, leaving the page fully server-
// rendered but with zero React hydration — no event listeners attached
// anywhere, confirmed via missing __react* keys on DOM nodes. 'unsafe-inline'
// "fixes" that but reopens the exact XSS hole CSP exists to close. A nonce,
// regenerated fresh per request and threaded through by Next automatically
// to its own inline/page scripts, is the documented fix that keeps CSP
// strict. 'strict-dynamic' lets our own Turnstile script — inserted via a
// plain document.createElement/appendChild in turnstile-widget.tsx, with no
// nonce attribute of its own — inherit trust from the already-nonced script
// that creates it, so it doesn't need special-casing here.
// Stripe additions (2026-08-15, /pods/members/[id]'s embedded Checkout sell
// panel) follow Stripe's own documented CSP directives exactly
// (docs.stripe.com/security/guide — "Checkout" + "Stripe.js" sections
// combined, since Embedded Checkout uses both): script-src/frame-src need
// js.stripe.com + checkout.stripe.com for the widget and payment iframe,
// connect-src needs api.stripe.com + checkout.stripe.com for Stripe.js's
// own API calls, frame-src needs hooks.stripe.com for 3D Secure redirect
// challenges, and img-src needs the *.stripe.com wildcard for Checkout's
// own asset loading.
function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://js.stripe.com https://checkout.stripe.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.stripe.com",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com https://api.stripe.com https://checkout.stripe.com",
    "frame-src https://challenges.cloudflare.com https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  request.headers.set("x-nonce", nonce);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export const config = {
  matcher: [
    // Any root-level /public static asset (e.g. /logo-mark.png) was falling
    // through this matcher and getting the same auth-redirect treatment as a
    // real page — an unauthenticated request for the logo got 307'd to
    // /login instead of the image, breaking the logo on every unauthenticated
    // page. Excluding by common static-asset extension covers this file and
    // any future one, not just the specific names already listed.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico)$).*)",
  ],
};
