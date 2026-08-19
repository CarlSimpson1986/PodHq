import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Session-aware client for Server Components / Route Handlers. Uses the
 * caller's own auth cookies (not the service key) so it respects RLS —
 * this is how we find out *who* is asking before deciding what they see.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              secure: true,
              // Lax, not strict — a top-level cross-site redirect back into
              // this app (Stripe Connect's Account Link return_url) has
              // Strict cookies silently withheld by the browser, which
              // logs the admin out mid-flow. Lax still blocks cross-site
              // POST/CSRF, just not this GET redirect. Same fix podhq-
              // client already applied for its own Stripe Checkout
              // success_url redirect (Stage 4).
              sameSite: "lax",
            });
          });
        } catch {
          // setAll called from a Server Component — middleware refreshes
          // the session cookie instead, so this is safe to ignore.
        }
      },
    },
  });
}
