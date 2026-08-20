import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { createPackCheckoutSession, createMembershipCheckoutSession } from "@/lib/data/sales";
import { getCatalogItemBySlug } from "@/lib/data/catalog";
import { createSalesCheckoutSchema } from "@/lib/validation/sales";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/pods/sales/checkout");
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
    const parsed = createSalesCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (!gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    // A "discount or full price" charge can never exceed the catalog's own
    // listed price — that's not a discount, it's a markup, and this
    // feature was never meant to let staff charge more than what members
    // themselves are offered.
    const catalogItem = await getCatalogItemBySlug(gym, parsed.data.itemId);
    if (!catalogItem || catalogItem.type !== parsed.data.type) {
      return NextResponse.json({ status: "error", message: "Unknown pack or tier." }, { status: 400 });
    }
    if (parsed.data.priceGBP > catalogItem.priceGBP) {
      return NextResponse.json(
        { status: "error", message: "Price can't exceed the listed price." },
        { status: 400 }
      );
    }

    if (!user.email) {
      return NextResponse.json({ status: "error", message: "Account has no email on record." }, { status: 400 });
    }
    const actor = { userId: user.id, email: user.email };

    const origin = request.nextUrl.origin;
    const result =
      parsed.data.type === "credit_pack"
        ? await createPackCheckoutSession(gym, parsed.data.memberId, parsed.data.itemId, parsed.data.priceGBP, origin, actor)
        : await createMembershipCheckoutSession(
            gym,
            parsed.data.memberId,
            parsed.data.itemId,
            parsed.data.priceGBP,
            parsed.data.discountMode ?? "ongoing",
            origin,
            actor
          );

    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Member not found." }, { status: 404 });
    }
    if (result.status === "unknown_item") {
      return NextResponse.json({ status: "error", message: "Unknown pack or tier." }, { status: 400 });
    }
    if (result.status === "already_active") {
      return NextResponse.json(
        { status: "error", message: "This member already has an active membership." },
        { status: 409 }
      );
    }
    if (result.status === "error") {
      console.error("[api/pods/sales/checkout POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not start checkout." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", clientSecret: result.clientSecret, stripeAccountId: result.stripeAccountId });
  } catch (err) {
    console.error("[api/pods/sales/checkout POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
