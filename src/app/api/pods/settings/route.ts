import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getPodResourcesForGym, updatePodResourceSettings } from "@/lib/data/pods";
import { podSettingsQuerySchema, updatePodSettingsSchema } from "@/lib/validation/pods";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveGym } from "@/lib/auth/resolve-gym";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/pods/settings");
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

    const parsed = podSettingsQuerySchema.safeParse({ gym: request.nextUrl.searchParams.get("gym") ?? undefined });
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    const gym = resolveGym(scope, parsed.data.gym);
    if (!gym) {
      return NextResponse.json({ status: "error", message: "A valid gym must be specified." }, { status: 400 });
    }

    // Returns every resource for the gym now, not a single settings
    // object — a gym can have more than one bookable resource (see
    // pod_resources). The client picks which one it's editing.
    const resources = await getPodResourcesForGym(gym);
    return NextResponse.json({ status: "ok", resources });
  } catch (err) {
    console.error("[api/pods/settings GET]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
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

  const rateLimit = await checkRateLimit(user.id, "/api/pods/settings");
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
    const parsed = updatePodSettingsSchema.safeParse(body);
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

    const updated = await updatePodResourceSettings(parsed.data.resourceId, gym, {
      podCapacity: parsed.data.podCapacity,
      openHour: parsed.data.openHour,
      closeHour: parsed.data.closeHour,
    });

    if (!updated) {
      return NextResponse.json({ status: "error", message: "Resource not found." }, { status: 404 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[api/pods/settings POST]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
