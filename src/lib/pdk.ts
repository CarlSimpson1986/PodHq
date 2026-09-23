import "server-only";

// Shared PDK (ProdataKey) API helpers — credentials (PDK_CLIENT_ID/
// PDK_CLIENT_SECRET) live only in podHQ, so every PDK call podhq-client
// needs is proxied through podHQ's /api/pdk/* routes and lands here.
// Endpoints verified against developer.pdk.io/web/2.0 (holders, groups)
// 2026-09-23.

// The PDK group that grants door access at a gym — the same group Carl's
// first live-tested holder was in (see 0100_pdk_unlock_test_setup.sql).
// Resolved by exact name at runtime rather than a stored ID, since it's
// named identically in each PDK system.
const ACCESS_GROUP_NAME = "Booking Access";

const TIMEOUT_MS = 10000;

export async function getSystemToken(systemId: string): Promise<string> {
  const clientId = process.env.PDK_CLIENT_ID;
  const clientSecret = process.env.PDK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PDK not configured.");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://accounts.pdk.io/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!tokenRes.ok) {
    throw new Error(`PDK token request failed: ${tokenRes.status}`);
  }
  const { id_token: idToken } = await tokenRes.json();

  const sysTokenRes = await fetch(`https://accounts.pdk.io/api/systems/${systemId}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!sysTokenRes.ok) {
    throw new Error(`PDK system token request failed: ${sysTokenRes.status}`);
  }
  const { token } = await sysTokenRes.json();
  return token;
}

export interface NewHolder {
  firstName: string;
  lastName: string;
  email: string | null;
}

async function findAccessGroupId(systemId: string, systemToken: string): Promise<string> {
  const res = await fetch(
    `https://systems.pdk.io/${systemId}/groups?search=${encodeURIComponent(ACCESS_GROUP_NAME)}&per_page=100`,
    { headers: { Authorization: `Bearer ${systemToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!res.ok) {
    throw new Error(`PDK group lookup failed: ${res.status}`);
  }
  const groups: { id: string; name: string }[] = await res.json();
  const group = groups.find((g) => g.name === ACCESS_GROUP_NAME);
  if (!group) {
    throw new Error(`PDK group "${ACCESS_GROUP_NAME}" not found in system ${systemId}`);
  }
  return group.id;
}

// Idempotent — PDK's single-group PUT adds without touching the holder's
// other groups, and re-adding an existing member is a no-op. Also used to
// re-add a linked holder whose unlock failed: GymFlow manages this same
// group's membership dynamically and may have removed them from it.
export async function addToAccessGroup(systemId: string, systemToken: string, holderId: string): Promise<void> {
  const groupId = await findAccessGroupId(systemId, systemToken);
  const res = await fetch(`https://systems.pdk.io/${systemId}/holders/${holderId}/groups/${groupId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${systemToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`PDK add-to-group failed: ${res.status}: ${await res.text()}`);
  }
}

// Links a member to their PDK holder, reusing an existing one (e.g. from
// GymFlow) when the email matches exactly, otherwise creating one — then
// makes sure it's in the access group. Holders at these gyms carry no
// fob/PIN (confirmed by Carl 2026-09-23 — same credential-less model as
// GymFlow's own), so group membership alone can only ever open a door
// via an API virtual-read, and podhq-client's unlock route already
// enforces the booking window before calling that.
export async function ensureAccessHolder(systemId: string, systemToken: string, holder: NewHolder): Promise<string> {
  const base = `https://systems.pdk.io/${systemId}`;
  const auth = { Authorization: `Bearer ${systemToken}` };

  let holderId: string | undefined;

  if (holder.email) {
    // PDK's search is a partial match — filter to an exact,
    // case-insensitive email match ourselves.
    const searchRes = await fetch(
      `${base}/holders?search=${encodeURIComponent(holder.email)}&search_fields=email&per_page=100`,
      { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!searchRes.ok) {
      throw new Error(`PDK holder search failed: ${searchRes.status}`);
    }
    const matches: { id: string; email?: string | null }[] = await searchRes.json();
    const target = holder.email.toLowerCase();
    holderId = matches.find((h) => h.email?.toLowerCase() === target)?.id;
  }

  if (!holderId) {
    const createRes = await fetch(`${base}/holders`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: holder.firstName,
        lastName: holder.lastName,
        ...(holder.email ? { email: holder.email } : {}),
        enabled: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!createRes.ok) {
      throw new Error(`PDK holder create failed: ${createRes.status}: ${await createRes.text()}`);
    }
    holderId = ((await createRes.json()) as { id: string }).id;
  }

  await addToAccessGroup(systemId, systemToken, holderId);
  return holderId;
}

export async function virtualRead(
  systemToken: string,
  ids: { systemId: string; cloudNodeId: string; deviceId: string; holderId: string }
): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch(
    `https://systems.pdk.io/${ids.systemId}/cloud-nodes/${ids.cloudNodeId}/devices/${ids.deviceId}/virtual-read`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${systemToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ holderId: ids.holderId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  return { ok: res.ok, detail: res.ok ? "" : `${res.status}: ${await res.text()}` };
}
