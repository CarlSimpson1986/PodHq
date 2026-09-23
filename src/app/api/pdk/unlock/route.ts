import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { addToAccessGroup, ensureAccessHolder, getSystemToken, virtualRead, type NewHolder } from "@/lib/pdk";

// Internal server-to-server endpoint, called by podhq-client's own
// unlock route — not by any browser. PDK's client_id/client_secret live
// only in podHQ (see this session's own design discussion: centralizing
// third-party credentials in one app rather than duplicating them), so
// podhq-client proxies the actual PDK call through here instead of
// holding its own copy. Authenticated via a shared secret (PDK_PROXY_SECRET,
// known to both apps), not a user session — there is no podHQ session on
// a request from another app's server.
export async function POST(request: NextRequest) {
  const proxySecret = process.env.PDK_PROXY_SECRET;
  if (!proxySecret) {
    return NextResponse.json({ status: "error", message: "Proxy not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.replace(/^Bearer\s+/i, "");
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(proxySecret);
  const authorized =
    providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);

  if (!authorized) {
    return NextResponse.json({ status: "error", message: "Unauthorized." }, { status: 401 });
  }

  let body: {
    systemId?: string;
    cloudNodeId?: string;
    deviceId?: string;
    holderId?: string;
    newHolder?: NewHolder;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }

  // Either an existing holderId, or newHolder details for a member who
  // hasn't been linked to PDK yet — matched by email or created here on
  // their first unlock (see ensureAccessHolder), and the ID returned so
  // podhq-client can save it to members.pdk_holder_id.
  const { systemId, cloudNodeId, deviceId, newHolder } = body;
  if (!systemId || !cloudNodeId || !deviceId || (!body.holderId && !newHolder?.firstName)) {
    return NextResponse.json({ status: "error", message: "Missing required fields." }, { status: 400 });
  }

  let holderId = body.holderId;
  try {
    const systemToken = await getSystemToken(systemId);

    let linked = false;
    if (!holderId && newHolder) {
      holderId = await ensureAccessHolder(systemId, systemToken, newHolder);
      linked = true;
    }

    const ids = { systemId, cloudNodeId, deviceId, holderId: holderId! };
    let result = await virtualRead(systemToken, ids);
    if (!result.ok) {
      // Either a just-linked holder's group membership hasn't reached
      // PDK's access evaluation yet, or an already-linked holder was
      // taken out of the access group (GymFlow manages it too) — re-add
      // (a no-op if already there) and retry once. The 2s wait is
      // unverified live as of writing.
      if (!linked) {
        await addToAccessGroup(systemId, systemToken, holderId!);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      result = await virtualRead(systemToken, ids);
    }

    if (!result.ok) {
      return NextResponse.json({ status: "error", message: result.detail, holderId }, { status: 502 });
    }
    return NextResponse.json({ status: "ok", holderId });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      {
        status: "error",
        message: timedOut ? "PDK request timed out." : err instanceof Error ? err.message : "PDK request failed.",
        // Returned even on failure — if the holder was created before a
        // later step failed, podhq-client still saves it rather than
        // creating a duplicate on the member's retry.
        holderId,
      },
      { status: 502 }
    );
  }
}
