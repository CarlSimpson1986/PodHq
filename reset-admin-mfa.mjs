// Removes the MFA factor currently enrolled on admin@myfitpod.co.uk (set up
// on your own phone) so the next person to log in with this account gets a
// fresh QR code to scan on THEIR phone instead.
// Run from the project root: node --env-file=.env.local reset-admin-mfa.mjs

import { createClient } from "@supabase/supabase-js";

const EMAIL = "admin@myfitpod.co.uk";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — run this with: node --env-file=.env.local reset-admin-mfa.mjs");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let page = 1;
let user = null;
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("Failed to list users:", error.message);
    process.exit(1);
  }
  user = data.users.find((u) => u.email === EMAIL);
  if (user || data.users.length < 200) break;
  page += 1;
}

if (!user) {
  console.error("No account found for", EMAIL);
  process.exit(1);
}

const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
if (listError) {
  console.error("Failed to list MFA factors:", listError.message);
  process.exit(1);
}

if (!factors.factors.length) {
  console.log("No MFA factors enrolled on this account — nothing to reset.");
  process.exit(0);
}

for (const factor of factors.factors) {
  const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
  if (deleteError) {
    console.error(`Failed to delete factor ${factor.id}:`, deleteError.message);
    process.exit(1);
  }
  console.log("Deleted factor:", factor.id, `(${factor.status})`);
}

console.log("\nMFA reset. The next login to", EMAIL, "will be sent to /login/mfa-setup for a fresh QR code.");
