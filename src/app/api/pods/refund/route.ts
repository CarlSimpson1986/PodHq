import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { lookupRefundableTransaction } from "@/lib/data/refunds";
import { getStripeClient } from "@/lib/stripe";
import { createRefundSchema } from "@/lib/validation/refunds";
import { checkRateLimit } from "@/lib/rate-limit";

// Only calls Stripe — never writes the credits/gift_vouchers ledger itself.
// podhq-client's existing webhook (already the sole writer for every other
// Stripe-driven ledger change in this system) picks up the resulting
// charge.refunded event and does that write, so a refund that succeeds at
// Stripe but fails to record here still lands correctly once the webhook
// fires, instead of the two systems drifting apart.
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/pods/refund");
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

    const body = await request.json().catch(() => null);
    const parsed = createRefundSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const lookup = await lookupRefundableTransaction(parsed.data.type, parsed.data.id);

    if (lookup.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Transaction not found." }, { status: 404 });
    }
    if (lookup.status === "already_refunded") {
      return NextResponse.json({ status: "error", message: "This has already been refunded." }, { status: 409 });
    }

    // Owner is locked to their own gym. The transaction's real gym comes
    // from the server-side lookup above, never from anything the client
    // sent — a 404 here (not 403) avoids confirming another gym's
    // transaction even exists.
    if (scope.role === "owner" && lookup.memberGym !== scope.gym) {
      return NextResponse.json({ status: "error", message: "Transaction not found." }, { status: 404 });
    }

    const stripe = getStripeClient();
    const refund = await stripe.refunds.create({ payment_intent: lookup.paymentIntentId });

    return NextResponse.json({ status: "ok", refundId: refund.id, amountRefunded: refund.amount });
  } catch (err) {
    console.error("[api/pods/refund POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
