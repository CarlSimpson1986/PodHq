// Read-only check: shows what MFA factors (if any) exist on admin@myfitpod.co.uk.
// Run from the project root: node --env-file=.env.local check-admin-mfa.mjs

import { createClient } from "@supabase/supabase-js";

const EMAIL = "admin@myfitpod.co.uk";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — run this with: node --env-file=.env.local check-admin-mfa.mjs");
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
  console.log("No MFA factors on this account — he'll get a clean QR code on first login. No reset needed.");
} else {
  for (const f of factors.factors) {
    console.log("Factor:", f.id, "| status:", f.status, "| created:", f.created_at);
  }
  if (factors.factors.some((f) => f.status === "verified")) {
    console.log("\nA VERIFIED factor exists — this is what would be enrolled on your phone.");
    console.log("Run reset-admin-mfa.mjs before he logs in, or he'll be stuck at the MFA screen.");
  } else {
    console.log("\nOnly unverified factor(s) — these get auto-cleaned on the next enrol attempt.");
    console.log("No reset needed; he can log in and enrol fresh.");
  }
}
