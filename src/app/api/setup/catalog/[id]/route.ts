import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { updateCatalogItem, setCatalogItemEnabled } from "@/lib/data/catalog";
import { updateCatalogItemSchema, setCatalogItemEnabledSchema } from "@/lib/validation/catalog";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import { checkRateLimit } from "@/lib/rate-limit";

function isGymName(value: string): value is GymName {
  return (GYM_NAMES as readonly string[]).includes(value);
}

function resolveGym(
  scope: { role: "admin"; gym: null } | { role: "owner"; gym: GymName },
  gymParam: string | null | undefined
): GymName | null {
  if (scope.role === "owner") return scope.gym;
  if (!gymParam || !isGymName(gymParam)) return null;
  return gymParam;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/setup/catalog/[id]");
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

    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ status: "error", message: "Invalid item." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);

    // Two different edits share this route: the full name/label/credits/
    // price form, and the simple enable/disable toggle — distinguished by
    // shape rather than a query param, since both are PATCHes to the same
    // resource. Owner is locked to their own gym; admin has fallback
    // access to whichever gym they select (same as everywhere else the
    // resolveGym pattern is used) — either way, the resolved gym is
    // checked server-side against the row's own gym, never trusted from
    // the client alone.
    if (body && typeof body === "object" && "enabled" in body) {
      const parsed = setCatalogItemEnabledSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
      }
      const gym = resolveGym(scope, parsed.data.gym);
      if (!gym) {
        return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
      }
      const result = await setCatalogItemEnabled(gym, itemId, parsed.data.enabled);
      if (result.status === "not_found") {
        return NextResponse.json({ status: "error", message: "Item not found." }, { status: 404 });
      }
      if (result.status === "error") {
        console.error("[api/setup/catalog/[id] PATCH]", { userId: user.id, error: result.message });
        return NextResponse.json({ status: "error", message: "Could not update this item." }, { status: 500 });
      }
      return NextResponse.json({ status: "ok" });
    }

    const parsed = updateCatalogItemSchema.safeParse(body);
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

    const result = await updateCatalogItem(gym, itemId, {
      name: parsed.data.name,
      label: parsed.data.label,
      credits: parsed.data.credits,
      priceGBP: parsed.data.priceGBP,
    });
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Item not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/setup/catalog/[id] PATCH]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not update this item." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/setup/catalog/[id] PATCH]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
