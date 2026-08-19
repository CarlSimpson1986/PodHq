import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { completeStripeConnectReturn } from "@/lib/data/stripe-connect-config";
import { GYM_NAMES, type GymName } from "@/lib/data/types";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

// Stripe's account_onboarding Account Link redirects the browser here (a
// plain top-level GET, same shape as podhq-client's Stripe Checkout
// success_url) once the admin exits the hosted onboarding flow — reaching
// this URL only means the flow was entered and exited, not that
// onboarding actually finished, so the real state is re-checked against
// Stripe directly (completeStripeConnectReturn) rather than trusted from
// the redirect alone.
export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const origin = request.nextUrl.origin;
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const scope = await getGymScope(user.id);
  if (!scope || scope.role !== "admin") {
    return NextResponse.redirect(`${origin}/setup`);
  }

  const gymParam = request.nextUrl.searchParams.get("gym");
  const gym = gymParam && isGymName(gymParam) ? gymParam : null;
  if (gym) {
    try {
      await completeStripeConnectReturn(gym);
    } catch (err) {
      console.error("[api/setup/stripe-connect/return]", { userId: user.id, error: err instanceof Error ? err.message : err });
    }
  }

  return NextResponse.redirect(`${origin}/setup`);
}
