// Throwaway: the actual unlock check — does this member have an active
// booking whose window (slot_start - 5min to slot_start + 1hr + 5min)
// contains right now? If so, call Kisi and log the attempt either way.
// Run: node --env-file=.env.local try-unlock.mjs [memberId] [--dry-run]
// --dry-run verifies the booking-window logic only — skips the real Kisi
// call and the pod_access_events write entirely, so nothing physical
// happens and no fake event lands in the audit log.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const kisiKey = process.env.KISI_API_KEY;

if (!url || !serviceKey || !kisiKey) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or KISI_API_KEY — run with: node --env-file=.env.local try-unlock.mjs");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const MEMBER_ID = Number(process.argv[2]) || 1;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const now = new Date();

const { data: bookings, error: bookingError } = await admin
  .from("bookings")
  .select("*")
  .eq("member_id", MEMBER_ID)
  .eq("status", "booked");

if (bookingError) {
  console.error("Failed to look up bookings:", bookingError.message);
  process.exit(1);
}

const active = bookings.find((b) => {
  const start = new Date(b.slot_start);
  const windowStart = new Date(start.getTime() - 5 * 60 * 1000);
  const windowEnd = new Date(start.getTime() + 65 * 60 * 1000); // slot end (+1hr) + 5min grace
  return now >= windowStart && now <= windowEnd;
});

if (!active) {
  console.log("No active booking in the unlock window right now — denied.");
  process.exit(0);
}

const { data: mapping, error: mapError } = await admin
  .from("gym_kisi_mapping")
  .select("*")
  .eq("gym", active.gym)
  .single();

if (mapError || !mapping) {
  console.error("No Kisi mapping for gym:", active.gym);
  process.exit(1);
}

if (DRY_RUN) {
  console.log("DRY RUN — would unlock now, nothing physical or logged:");
  console.log("  booking_id:", active.id);
  console.log("  gym:", active.gym);
  console.log("  slot_start:", active.slot_start);
  console.log("  kisi_lock_id:", mapping.kisi_lock_id);
  process.exit(0);
}

const res = await fetch(`https://api.kisi.io/locks/${mapping.kisi_lock_id}/unlock`, {
  method: "POST",
  headers: {
    Authorization: `KISI-LOGIN ${kisiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const success = res.ok;
const responseText = success ? "200 OK" : `${res.status} ${res.statusText}: ${await res.text()}`;

await admin.from("pod_access_events").insert({
  booking_id: active.id,
  member_id: MEMBER_ID,
  success,
  kisi_response: responseText,
});

console.log(success ? "Unlock request succeeded — check the physical door." : "Unlock failed.");
console.log("  booking_id:", active.id);
console.log("  response:", responseText);
