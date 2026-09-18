// One-time setup script — registers a SINGLE dealer-level PDK webhook
// subscription covering every gym at once (scope: 'recursive'). Not
// called at runtime by anything; only ever needs running once total, not
// once per gym — re-run only if the subscription needs recreating (e.g.
// URL or secret changed). Check GET /organizations/{DEALER_ID}/subscriptions
// first if unsure whether one already exists.
//
// Why recursive/dealer-level rather than per-gym: confirmed live
// 2026-09-18 that these credentials only have "direct access" to the
// dealer org (Carl explicitly requested dealer-level, not per-system,
// permissions — see podhq-client/ROADMAP-ARCHIVE-71.md's 2026-09-09 PDK
// scouting note), so POST /organizations/{childOrgId}/subscriptions
// 403s. A non-recursive array-of-cloud-node-ids scope was the other
// option tried, but PDK's docs restrict that to cloud-node-category
// events only, not device.request.allowed/denied — so recursive is the
// only shape that actually works for the events we want. The webhook
// route resolves which gym an event belongs to from the payload's own
// cloudNodeId against gym_pdk_mapping, not from the URL.
//
// Requires PDK_CLIENT_ID, PDK_CLIENT_SECRET, PDK_WEBHOOK_SECRET, and
// PODHQ_BASE_URL (the real deployed URL PDK's cloud can reach — this
// cannot be localhost) in the environment.
//
// Run with: node --env-file=.env.local scripts/register-pdk-webhook.mjs

const DEALER_ID = "6a22a8790d0d890ad6dfe37f"; // S&D Facilities LTD

const clientId = process.env.PDK_CLIENT_ID;
const clientSecret = process.env.PDK_CLIENT_SECRET;
const webhookSecret = process.env.PDK_WEBHOOK_SECRET;
const baseUrl = process.env.PODHQ_BASE_URL;

if (!clientId || !clientSecret || !webhookSecret || !baseUrl) {
  console.error("Missing PDK_CLIENT_ID / PDK_CLIENT_SECRET / PDK_WEBHOOK_SECRET / PODHQ_BASE_URL in the environment.");
  process.exit(1);
}

async function getToken() {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.pdk.io/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.id_token;
}

const idToken = await getToken();

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/pdk/webhook`;

const res = await fetch(`https://accounts.pdk.io/api/organizations/${DEALER_ID}/subscriptions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "podHQ Access Log — all gyms",
    url: webhookUrl,
    scope: "recursive",
    authentication: { type: "None" },
    // Only the two access-result events — see the webhook route's own
    // comment for why the rest of PDK's event catalog is deliberately
    // excluded (cost + signal-to-noise).
    events: ["device.request.allowed", "device.request.denied"],
    secret: webhookSecret,
    active: true,
  }),
});

if (!res.ok) {
  console.error(`Subscription creation failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

console.log("Webhook subscription created, pointing at:", webhookUrl);
console.log(await res.json());
