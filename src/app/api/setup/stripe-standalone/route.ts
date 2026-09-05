import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getStripeStandaloneConfigSummary, upsertStripeStandaloneConfig } from "@/lib/data/stripe-connect-config";
import { upsertStripeStandaloneConfigSchema } from "@/lib/validation/stripe-connect";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuthEvent } from "@/lib/audit";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

// Admin-only, no owner fallback — same reasoning as /api/setup/resend:
// entering a real Stripe secret key is a technical credential-entry task,
// not a business decision like pricing.
export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/stripe-standalone");
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
      return NextResponse.json({ status: "ok", gym: null, config: null });
    }

    const config = await getStripeStandaloneConfigSummary(gym);
    return NextResponse.json({ status: "ok", gym, config });
  } catch (err) {
    console.error("[api/setup/stripe-standalone GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load the Stripe config." }, { status: 500 });
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

  const rateLimit = await checkRateLimit(user.id, "/api/setup/stripe-standalone");
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
    const parsed = upsertStripeStandaloneConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const result = await upsertStripeStandaloneConfig(
      parsed.data.gym,
      { apiKey: parsed.data.apiKey, webhookSecret: parsed.data.webhookSecret, publishableKey: parsed.data.publishableKey },
      user.id
    );
    if (result.status === "error") {
      console.error("[api/setup/stripe-standalone POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not save this config." }, { status: 500 });
    }

    await logAuthEvent({
      email: user.email ?? "",
      userId: user.id,
      eventType: "setup_stripe_standalone_key_updated",
      detail: JSON.stringify({ gym: parsed.data.gym }),
    });

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/setup/stripe-standalone POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
