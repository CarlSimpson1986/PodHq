// Throwaway spike: confirms a Kisi API key works and lists your places/locks.
// Does NOT unlock anything unless you pass a lock id as an argument.
// Run from the project root: node --env-file=.env.local check-kisi.mjs [lockIdToUnlock]

const API_KEY = process.env.KISI_API_KEY;

if (!API_KEY) {
  console.error("Missing KISI_API_KEY — add it to .env.local, then run: node --env-file=.env.local check-kisi.mjs");
  process.exit(1);
}

const headers = {
  Authorization: `KISI-LOGIN ${API_KEY}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function kisiGet(path) {
  const res = await fetch(`https://api.kisi.io${path}`, { headers });
  if (!res.ok) {
    console.error(`GET ${path} failed: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  return res.json();
}

console.log("Fetching places...");
const places = await kisiGet("/places");
for (const p of places) {
  console.log(`  place ${p.id}: ${p.name}`);
}

console.log("\nFetching locks...");
const locks = await kisiGet("/locks");
for (const l of locks) {
  console.log(`  lock ${l.id}: ${l.name} (place_id: ${l.place_id})`);
}

const lockIdToUnlock = process.argv[2];
if (!lockIdToUnlock) {
  console.log("\nNo lock id passed — not unlocking anything. Re-run with a lock id from the list above to test unlock:");
  console.log("  node --env-file=.env.local check-kisi.mjs <lockId>");
  process.exit(0);
}

console.log(`\nUnlocking lock ${lockIdToUnlock}...`);
const unlockRes = await fetch(`https://api.kisi.io/locks/${lockIdToUnlock}/unlock`, {
  method: "POST",
  headers,
});

if (unlockRes.ok) {
  console.log("Unlock request succeeded (200 OK) — check the physical door/relay.");
} else {
  console.error(`Unlock failed: ${unlockRes.status} ${unlockRes.statusText}`);
  console.error(await unlockRes.text());
}
