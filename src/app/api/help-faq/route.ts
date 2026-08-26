import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { listFaqItems, createFaqItem } from "@/lib/data/help-faq";
import { upsertFaqItemSchema } from "@/lib/validation/help-faq";
import { checkRateLimit } from "@/lib/rate-limit";

// Read: both roles — an owner can see what the bot is telling their own
// members even though they can't change it. Write: admin-only, same
// reasoning as Brevo config (setup/brevo/route.ts) — one FAQ answer here
// changes what every gym's members hear, not a per-gym business decision.
export async function GET() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/help-faq");
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

    const items = await listFaqItems();
    return NextResponse.json({ status: "ok", items });
  } catch (err) {
    console.error("[api/help-faq GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Could not load the FAQ." }, { status: 500 });
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

  const rateLimit = await checkRateLimit(user.id, "/api/help-faq");
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
    const parsed = upsertFaqItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const result = await createFaqItem({
      question: parsed.data.question,
      answer: parsed.data.answer,
      displayOrder: parsed.data.displayOrder,
      createdBy: user.id,
    });
    if (result.status === "error") {
      console.error("[api/help-faq POST]", { userId: user.id, error: result.message });
      return NextResponse.json({ status: "error", message: "Could not create this FAQ item." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", item: result.item });
  } catch (err) {
    console.error("[api/help-faq POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
