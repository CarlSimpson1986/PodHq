import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listCatalogItems, createCatalogItem } from "@/lib/data/catalog";
import { createCatalogItemSchema } from "@/lib/validation/catalog";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

// Owner manages their own gym's catalog; admin has fallback access to
// whichever gym they select — same oversight pattern as Outgoings/Other
// Income/Marketing, not the "admin locked out entirely" design this
// started with.
export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/catalog");
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

    const gym = resolveGym(scope, request.nextUrl.searchParams.get("gym"));
    if (!gym) {
      return NextResponse.json({ status: "ok", gym: null, items: [] });
    }

    const items = await listCatalogItems(gym);
    return NextResponse.json({ status: "ok", gym, items });
  } catch (err) {
    console.error("[api/setup/catalog GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load the catalog." }, { status: 500 });
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

  const rateLimit = await checkRateLimit(user.id, "/api/setup/catalog");
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
    const parsed = createCatalogItemSchema.safeParse(body);
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

    const result = await createCatalogItem({
      gym,
      type: parsed.data.type,
      name: parsed.data.name,
      label: parsed.data.label,
      credits: parsed.data.credits,
      priceGBP: parsed.data.priceGBP,
      oneTimePerMember: parsed.data.oneTimePerMember,
    });
    if (result.status === "error") {
      console.error("[api/setup/catalog POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not create this item." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", item: result.item });
  } catch (err) {
    console.error("[api/setup/catalog POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
