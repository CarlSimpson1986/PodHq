// Throwaway: books the current hour's slot for a member via the
// create_booking() function (atomic balance check + insert + deduction).
// Run: node --env-file=.env.local create-booking.mjs [memberId]

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — run with: node --env-file=.env.local create-booking.mjs");
  process.exit(1);
}

const MEMBER_ID = Number(process.argv[2]) || 1;
const GYM = "Aylesbury Berryfields";

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Current hour, so the unlock window is immediately testable.
const slotStart = new Date();
slotStart.setMinutes(0, 0, 0);

const { data: bookingId, error } = await admin.rpc("create_booking", {
  p_member_id: MEMBER_ID,
  p_gym: GYM,
  p_slot_start: slotStart.toISOString(),
});

if (error) {
  console.error("Booking failed:", error.message);
  process.exit(1);
}

console.log("Booking created:");
console.log("  booking_id:", bookingId);
console.log("  member_id:", MEMBER_ID);
console.log("  gym:", GYM);
console.log("  slot_start:", slotStart.toISOString());
