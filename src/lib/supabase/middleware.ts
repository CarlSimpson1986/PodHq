import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/login/mfa",
  "/login/mfa-setup",
  "/login/set-password",
  "/auth/callback",
];

const PUBLIC_API_PREFIXES = ["/api/auth/"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Refreshes the Supabase session cookie on every request and enforces:
 * unauthenticated -> /login, MFA-pending -> the right challenge/setup
 * page, and admin-only paths -> role check against users_gyms.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase server environment variables are not configured");
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure: true,
            sameSite: "strict",
          })
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  if (!user) {
    if (isPublic) return supabaseResponse;
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaChallengePending = !!aal && aal.currentLevel !== aal.nextLevel;

  if (mfaChallengePending) {
    if (pathname === "/login/mfa") return supabaseResponse;
    return NextResponse.redirect(new URL("/login/mfa", request.url));
  }

  const { data: gymRows } = await supabase
    .from("users_gyms")
    .select("role")
    .eq("user_id", user.id)
    .limit(1);
  const role = gymRows?.[0]?.role;

  // Admin MFA is mandatory: Supabase's own AAL check can't know that, since
  // it only requires aal2 once a factor exists. Enforce it ourselves.
  if (role === "admin") {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    if (!factors?.totp.length) {
      if (pathname === "/login/mfa-setup") return supabaseResponse;
      return NextResponse.redirect(new URL("/login/mfa-setup", request.url));
    }
  }

  // Fully authenticated (and MFA-compliant) at this point — bounce away
  // from the login flow.
  if (pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}
