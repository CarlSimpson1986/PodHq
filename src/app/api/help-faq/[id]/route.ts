import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { updateFaqItem, deleteFaqItem } from "@/lib/data/help-faq";
import { upsertFaqItemSchema } from "@/lib/validation/help-faq";
import { checkRateLimit } from "@/lib/rate-limit";

async function requireAdmin(userId: string) {
  const scope = await getGymScope(userId);
  if (!scope) return { error: NextResponse.json({ status: "error", message: "No gym or role is assigned to this account." }, { status: 403 }) };
  if (scope.role !== "admin") return { error: NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 }) };
  return { error: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/help-faq/[id]");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const { error } = await requireAdmin(user.id);
    if (error) return error;

    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ status: "error", message: "Invalid item." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = upsertFaqItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const result = await updateFaqItem(itemId, parsed.data);
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Item not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/help-faq/[id] PATCH]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not update this item." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/help-faq/[id] PATCH]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/help-faq/[id]");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const { error } = await requireAdmin(user.id);
    if (error) return error;

    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ status: "error", message: "Invalid item." }, { status: 400 });
    }

    const result = await deleteFaqItem(itemId);
    if (result.status === "not_found") {
      return NextResponse.json({ status: "error", message: "Item not found." }, { status: 404 });
    }
    if (result.status === "error") {
      console.error("[api/help-faq/[id] DELETE]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not delete this item." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/help-faq/[id] DELETE]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
