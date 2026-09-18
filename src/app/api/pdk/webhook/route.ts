import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Called by PDK's (ProdataKey) cloud, not a browser — no session cookie
// exists here, same reasoning as podhq-client's Stripe webhook route.
//
// One shared endpoint for every gym, not one per gym: the underlying PDK
// subscription is registered at the dealer org with scope 'recursive'
// (see scripts/register-pdk-webhook.mjs's own comment for why a
// per-gym-scoped subscription isn't possible with these credentials),
// so a single subscription delivers events from every child org/gym to
// this one URL. Gym is resolved from the payload's own cloudNodeId
// against gym_pdk_mapping, not from anything in the URL.
//
// Only device.request.allowed/denied are subscribed to right now — see
// the registration script for why the rest of PDK's event catalog
// (DPS state, lock activate/deactivate, REX, holder lifecycle) is
// deliberately excluded (cost + signal-to-noise).
export async function POST(request: NextRequest) {
  const signature = request.headers.get("X-PDK-SIGNATURE");
  const secret = process.env.PDK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ status: "error", message: "Webhook not configured." }, { status: 500 });
  }
  if (!signature) {
    return NextResponse.json({ status: "error", message: "Missing signature." }, { status: 401 });
  }

  const rawBody = await request.text();
  const expected = createHmac("sha1", secret).update(rawBody).digest("hex");

  // Lengths always match (both hex SHA-1 digests) except when a signature
  // is garbage, which timingSafeEqual throws on rather than returning
  // false for — length-check first so a malformed header 500s cleanly
  // via the catch-all below instead of leaking timing behavior either way.
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const validSignature =
    signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!validSignature) {
    return NextResponse.json({ status: "error", message: "Invalid signature." }, { status: 401 });
  }

  let payload: {
    topic?: string;
    cloudNodeId?: string;
    metadata?: { holderName?: string; deviceName?: string; occurred?: number };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid payload." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Recursive scope means every gym under the dealer delivers here,
  // including ones (e.g. Brighton) with no gym_pdk_mapping row yet —
  // 200 with no insert rather than an error, so PDK doesn't see this as
  // a failing/retryable delivery for a gym we haven't onboarded.
  const { data: mapping } = await admin
    .from("gym_pdk_mapping")
    .select("gym")
    .eq("cloud_node_id", payload.cloudNodeId ?? "")
    .maybeSingle();

  if (!mapping) {
    return NextResponse.json({ status: "ok", message: "Unmapped cloud node, ignored." });
  }

  const topic = payload.topic ?? "unknown";

  const { error } = await admin.from("pdk_access_events").insert({
    gym: mapping.gym,
    holder_name: payload.metadata?.holderName ?? null,
    device_name: payload.metadata?.deviceName ?? null,
    raw_topic: topic,
    success: topic === "device.request.allowed",
    occurred_at: payload.metadata?.occurred ? new Date(payload.metadata.occurred).toISOString() : new Date().toISOString(),
  });

  if (error) {
    // Still 200-ing here would make PDK stop retrying a delivery we
    // failed to store — 500 is deliberate so a transient DB blip gets
    // redelivered rather than silently lost (PDK's own retry behavior is
    // undocumented, but there's no reason to assume the better case and
    // swallow the error).
    return NextResponse.json({ status: "error", message: "Failed to record event." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
