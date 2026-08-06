// Explores real per-customer purchase-gap patterns in Revenue, to inform
// churn-heuristic thresholds (separately for MEMBERSHIP vs CREDIT_PACK,
// since PAYG customers are known to buy less regularly without churning).
// Read-only — no writes.
// Run from the project root: node --env-file=.env.local explore-churn-gaps.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — run with: node --env-file=.env.local explore-churn-gaps.mjs");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Page through Revenue — PostgREST caps a single request at 1000 rows.
async function fetchAllRevenue() {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await admin
      .from("Revenue")
      .select("gym, sold_to, category, report_month")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function monthDiff(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

const rows = await fetchAllRevenue();
console.log(`Fetched ${rows.length} Revenue rows.\n`);

// Key = gym|sold_to|category — a customer can appear under both categories,
// and gym disambiguates same-name customers at different sites.
const groups = new Map();
for (const row of rows) {
  const key = `${row.gym}|||${row.sold_to}|||${row.category}`;
  if (!groups.has(key)) groups.set(key, new Set());
  groups.get(key).add(row.report_month);
}

const gapsByCategory = { MEMBERSHIP: [], CREDIT_PACK: [] };
let singlePurchaseCustomers = { MEMBERSHIP: 0, CREDIT_PACK: 0 };

for (const [key, monthSet] of groups) {
  const category = key.split("|||")[2];
  const months = [...monthSet].sort();
  if (months.length < 2) {
    singlePurchaseCustomers[category] = (singlePurchaseCustomers[category] ?? 0) + 1;
    continue;
  }
  for (let i = 1; i < months.length; i++) {
    gapsByCategory[category]?.push(monthDiff(months[i - 1], months[i]));
  }
}

for (const category of ["MEMBERSHIP", "CREDIT_PACK"]) {
  const gaps = (gapsByCategory[category] ?? []).sort((a, b) => a - b);
  console.log(`--- ${category} ---`);
  console.log(`Distinct customers with 2+ active months: ${gaps.length > 0 ? groups.size : 0} (see counts below)`);
  console.log(`Customers with only 1 active month ever (no gap data): ${singlePurchaseCustomers[category] ?? 0}`);
  console.log(`Total gap observations: ${gaps.length}`);
  if (gaps.length > 0) {
    console.log(`Gap distribution (months between consecutive purchases):`);
    console.log(`  p50: ${percentile(gaps, 0.5)}`);
    console.log(`  p75: ${percentile(gaps, 0.75)}`);
    console.log(`  p90: ${percentile(gaps, 0.9)}`);
    console.log(`  p95: ${percentile(gaps, 0.95)}`);
    console.log(`  p99: ${percentile(gaps, 0.99)}`);
    console.log(`  max: ${gaps[gaps.length - 1]}`);
    const distribution = {};
    for (const g of gaps) distribution[g] = (distribution[g] ?? 0) + 1;
    console.log(`  Full histogram (gap length -> count):`, distribution);
  }
  console.log();
}
