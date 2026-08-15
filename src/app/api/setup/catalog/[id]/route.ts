import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { updateCatalogItem, setCatalogItemEnabled } from "@/lib/data/catalog";
import { updateCatalogItemSchema, setCatalogItemEnabledSchema } from "@/lib/validation/catalog";
import { checkRateLimit } from "@/lib/rate-limit";

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
    if (!scope || scope.role !== "owner") {
      return NextResponse.json({ status: "error", message: "Owners only." }, { status: 403 });
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
    // resource. Both are scoped to the owner's own gym server-side — an
    // owner can never touch another gym's row by guessing its numeric id.
    if (body && typeof body === "object" && "enabled" in body) {
      const parsed = setCatalogItemEnabledSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
      }
      const result = await setCatalogItemEnabled(scope.gym, itemId, parsed.data.enabled);
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

    const result = await updateCatalogItem(scope.gym, itemId, parsed.data);
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
