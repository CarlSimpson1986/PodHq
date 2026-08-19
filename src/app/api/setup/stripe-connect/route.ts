import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getStripeConnectStatus, startStripeConnectOnboarding } from "@/lib/data/stripe-connect-config";
import { startStripeConnectSchema } from "@/lib/validation/stripe-connect";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuthEvent } from "@/lib/audit";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

// Admin-only, no owner fallback — same reasoning as /api/setup/resend:
// setting up a gym's Stripe Connect account is a technical task the
// franchisor handles on the gym's behalf, not a business decision like
// pricing.
export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/stripe-connect");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json(
        { status: "error", message: "No gym or role is assigned to this account." },
        { status: 403 }
      );
    }
    if (scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const gymParam = request.nextUrl.searchParams.get("gym");
    const gym = gymParam && isGymName(gymParam) ? gymParam : null;
    if (!gym) {
      return NextResponse.json({ status: "ok", gym: null, connectStatus: null });
    }

    const connectStatus = await getStripeConnectStatus(gym);
    return NextResponse.json({ status: "ok", gym, connectStatus });
  } catch (err) {
    console.error("[api/setup/stripe-connect GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load the Stripe Connect status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/stripe-connect");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json(
        { status: "error", message: "No gym or role is assigned to this account." },
        { status: 403 }
      );
    }
    if (scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = startStripeConnectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const origin = request.nextUrl.origin;
    const result = await startStripeConnectOnboarding(
      parsed.data.gym,
      `${origin}/api/setup/stripe-connect/return?gym=${encodeURIComponent(parsed.data.gym)}`,
      `${origin}/setup`,
      user.id
    );
    if (result.status === "error") {
      console.error("[api/setup/stripe-connect POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not start Stripe Connect onboarding." }, { status: 500 });
    }

    await logAuthEvent({
      email: user.email ?? "",
      userId: user.id,
      eventType: "setup_stripe_connect_started",
      detail: JSON.stringify({ gym: parsed.data.gym }),
    });

    return NextResponse.json({ status: "ok", url: result.url });
  } catch (err) {
    console.error("[api/setup/stripe-connect POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
