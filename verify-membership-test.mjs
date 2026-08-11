// Throwaway: verifies the Stage 8 membership webhook actually wrote what it
// should for the pilot member's test subscription, direct against the DB
// rather than trusting the UI's balance number alone.
// Run from the project root: node --env-file=.env.local verify-membership-test.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: member } = await admin
  .from("members")
  .select("id, name")
  .eq("gym", "Aylesbury Berryfields")
  .eq("name", "Pilot Test Member")
  .maybeSingle();

console.log("Member:", member);

const { data: memberships } = await admin
  .from("memberships")
  .select("*")
  .eq("member_id", member.id);

console.log("\nmemberships rows:", JSON.stringify(memberships, null, 2));

const { data: credits } = await admin
  .from("credits")
  .select("*")
  .eq("member_id", member.id)
  .order("created_at", { ascending: false })
  .limit(5);

console.log("\nMost recent credits rows:", JSON.stringify(credits, null, 2));
