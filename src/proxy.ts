import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Any root-level /public static asset (e.g. /logo-mark.png) was falling
    // through this matcher and getting the same auth-redirect treatment as a
    // real page — an unauthenticated request for the logo got 307'd to
    // /login instead of the image, breaking the logo on every unauthenticated
    // page. Excluding by common static-asset extension covers this file and
    // any future one, not just the specific names already listed.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-|icons/|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico)$).*)",
  ],
};
