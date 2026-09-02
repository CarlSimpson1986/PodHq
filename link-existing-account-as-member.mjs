// Throwaway: links an EXISTING Supabase Auth user (e.g. owner@example.com,
// which already exists as a podHq staff login, shared Supabase Auth project)
// to a new podhq-client members row, without going through /signup — that
// path silently no-ops for an email that already exists elsewhere in this
// shared project (Supabase's anti-enumeration behaviour sends no email and
// the account isn't linked), a known gap flagged 2026-08-11. This is the
// admin-mediated fallback, same category as reset-pilot-password.mjs.
// Run from the project root: node --env-file=.env.local link-existing-account-as-member.mjs <email>

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — run this with: node --env-file=.env.local link-existing-account-as-member.mjs <email>");
  process.exit(1);
}

const EMAIL = process.argv[2];
const GYM = "Aylesbury Berryfields";
const NAME = process.argv[3] ?? "Carl Simpson";

if (!EMAIL) {
  console.error("Usage: node --env-file=.env.local link-existing-account-as-member.mjs <email> [name]");
  process.exit(1);
}

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
  console.error("No existing auth user found for", EMAIL, "— use the normal /signup flow instead.");
  process.exit(1);
}

const { data: existingMember } = await admin
  .from("members")
  .select("id")
  .eq("auth_user_id", user.id)
  .maybeSingle();

if (existingMember) {
  console.log("Already linked — member_id:", existingMember.id);
  process.exit(0);
}

const { data: member, error: memberError } = await admin
  .from("members")
  .insert({ auth_user_id: user.id, gym: GYM, name: NAME })
  .select()
  .single();
if (memberError) {
  console.error("Failed to create member row:", memberError.message);
  process.exit(1);
}

console.log("Linked existing account as a pod member:");
console.log("  Email:", EMAIL);
console.log("  auth_user_id:", user.id);
console.log("  member_id:", member.id);
console.log("  Gym:", GYM);
console.log("  Sign in with your existing podHq password — no new credentials needed.");
