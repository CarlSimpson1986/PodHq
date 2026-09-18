import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

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

  let body: { systemId?: string; cloudNodeId?: string; deviceId?: string; holderId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }

  const { systemId, cloudNodeId, deviceId, holderId } = body;
  if (!systemId || !cloudNodeId || !deviceId || !holderId) {
    return NextResponse.json({ status: "error", message: "Missing required fields." }, { status: 400 });
  }

  const clientId = process.env.PDK_CLIENT_ID;
  const clientSecret = process.env.PDK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ status: "error", message: "PDK not configured." }, { status: 500 });
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://accounts.pdk.io/oauth2/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) {
      return NextResponse.json({ status: "error", message: `PDK token request failed: ${tokenRes.status}` }, { status: 502 });
    }
    const { id_token: idToken } = await tokenRes.json();

    const sysTokenRes = await fetch(`https://accounts.pdk.io/api/systems/${systemId}/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!sysTokenRes.ok) {
      return NextResponse.json({ status: "error", message: `PDK system token request failed: ${sysTokenRes.status}` }, { status: 502 });
    }
    const { token: systemToken } = await sysTokenRes.json();

    const readRes = await fetch(
      `https://systems.pdk.io/${systemId}/cloud-nodes/${cloudNodeId}/devices/${deviceId}/virtual-read`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${systemToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ holderId }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!readRes.ok) {
      const detail = await readRes.text();
      return NextResponse.json({ status: "error", message: `${readRes.status}: ${detail}` }, { status: 502 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      { status: "error", message: timedOut ? "PDK request timed out." : "PDK request failed." },
      { status: 502 }
    );
  }
}
