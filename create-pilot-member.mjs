// Throwaway: creates a separate pilot member account for testing the pod
// booking flow, distinct from any real admin/owner identity. Generates a
// one-time password (same pattern as createOwnerAccount), no email sent.
// Run from the project root: node --env-file=.env.local create-pilot-member.mjs

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — run this with: node --env-file=.env.local create-pilot-member.mjs");
  process.exit(1);
}

const EMAIL = "pilot-member@example.com";
const GYM = "Aylesbury Berryfields";
const NAME = "Pilot Test Member";
const STARTING_CREDITS = 10;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = crypto.randomBytes(12).toString("base64url");

const { data: userData, error: userError } = await admin.auth.admin.createUser({
  email: EMAIL,
  password,
  email_confirm: true,
});
if (userError) {
  console.error("Failed to create auth user:", userError.message);
  process.exit(1);
}

const { data: member, error: memberError } = await admin
  .from("members")
  .insert({ auth_user_id: userData.user.id, gym: GYM, name: NAME })
  .select()
  .single();
if (memberError) {
  console.error("Failed to create member row:", memberError.message);
  process.exit(1);
}

const { error: creditError } = await admin
  .from("credits")
  .insert({ member_id: member.id, amount: STARTING_CREDITS, reason: "manual_grant" });
if (creditError) {
  console.error("Failed to grant starting credits:", creditError.message);
  process.exit(1);
}

console.log("Pilot member account created:");
console.log("  Email:", EMAIL);
console.log("  Password:", password);
console.log("  auth_user_id:", userData.user.id);
console.log("  member_id:", member.id);
console.log("  Gym:", GYM);
console.log("  Starting credits:", STARTING_CREDITS);
