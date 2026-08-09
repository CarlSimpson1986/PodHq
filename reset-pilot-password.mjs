// Throwaway: resets the pilot member's password when it's been forgotten
// again (no self-service reset flow exists yet in podhq-client — that's
// Stage 5). Same pattern as create-pilot-member.mjs's password generation.
// Run from the project root: node --env-file=.env.local reset-pilot-password.mjs

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — run this with: node --env-file=.env.local reset-pilot-password.mjs");
  process.exit(1);
}

const EMAIL = "pilot-member@example.com";

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error("Failed to list users:", listError.message);
  process.exit(1);
}

const user = usersPage.users.find((u) => u.email === EMAIL);
if (!user) {
  console.error("No auth user found for", EMAIL);
  process.exit(1);
}

const password = crypto.randomBytes(12).toString("base64url");

const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
if (updateError) {
  console.error("Failed to update password:", updateError.message);
  process.exit(1);
}

console.log("Pilot member password reset:");
console.log("  Email:", EMAIL);
console.log("  New password:", password);
