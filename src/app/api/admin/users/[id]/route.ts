import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { setUserBanned, deleteUserAccount } from "@/lib/data/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const banSchema = z.object({ banned: z.boolean() }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/admin/users/[id]");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const { id: targetUserId } = await params;
    if (targetUserId === user.id) {
      return NextResponse.json(
        { status: "error", message: "You can't deactivate your own account." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = banSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    await setUserBanned(targetUserId, parsed.data.banned);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/admin/users/[id] PATCH]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not update this account. Try again." }, { status: 500 });
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

  const rateLimit = await checkRateLimit(user.id, "/api/admin/users/[id]");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const { id: targetUserId } = await params;
    if (targetUserId === user.id) {
      return NextResponse.json(
        { status: "error", message: "You can't delete your own account." },
        { status: 400 }
      );
    }

    // Only owner accounts are deletable from here — matches createOwnerAccount's
    // existing asymmetry (the most privileged role, admin, stays a manual,
    // out-of-band step, never created *or* deleted from this UI).
    const targetScope = await getGymScope(targetUserId);
    if (!targetScope || targetScope.role !== "owner") {
      return NextResponse.json(
        { status: "error", message: "Only franchisee (owner) accounts can be deleted here." },
        { status: 400 }
      );
    }

    await deleteUserAccount(targetUserId);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/admin/users/[id] DELETE]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not delete this account. Try again." }, { status: 500 });
  }
}
