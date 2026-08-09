// Throwaway: lists registered auth.users emails so we can pick a genuinely
// unused address for testing podhq-client's new self-signup flow.
// Run from the project root: node --env-file=.env.local list-auth-emails.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) {
  console.error("Failed to list users:", error.message);
  process.exit(1);
}

for (const u of data.users) {
  console.log(u.email, "-", u.email_confirmed_at ? "confirmed" : "unconfirmed");
}
console.log(`\nTotal: ${data.users.length}`);
