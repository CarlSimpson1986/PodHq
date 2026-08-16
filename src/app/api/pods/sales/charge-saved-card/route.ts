import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { chargeSavedCardForPack, createMembershipWithSavedCard } from "@/lib/data/sales";
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

  const rateLimit = await checkRateLimit(user.id, "/api/pods/sales/charge-saved-card");
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

    // Same ceiling as the checkout-session route: a saved-card charge is
    // still "discount or full price," never a markup on what members
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

    const result =
      parsed.data.type === "credit_pack"
        ? await chargeSavedCardForPack(gym, parsed.data.memberId, parsed.data.itemId, parsed.data.priceGBP, actor)
        : await createMembershipWithSavedCard(
            gym,
            parsed.data.memberId,
            parsed.data.itemId,
            parsed.data.priceGBP,
            parsed.data.discountMode ?? "ongoing",
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
    if (result.status === "no_saved_card") {
      return NextResponse.json({ status: "error", message: "This member has no card on file." }, { status: 409 });
    }
    if (result.status === "requires_authentication") {
      return NextResponse.json(
        { status: "error", message: "This card needs the member to re-authenticate — use a new card instead." },
        { status: 402 }
      );
    }
    if (result.status === "error") {
      console.error("[api/pods/sales/charge-saved-card POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not charge the saved card." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/pods/sales/charge-saved-card POST]", {
      userId: user.id,
      error: err instanceof Error ? err.message : err,
    });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
