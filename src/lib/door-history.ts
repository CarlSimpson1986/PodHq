import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSystemToken } from "@/lib/pdk";

// Pulls one calendar month (UTC) of door entries from Kisi's and PDK's own
// event history into door_entries (0102). Both vendors keep history well
// past a month — Kisi returned Sept 2024 events when checked 2026-09-25,
// PDK has Fairford Leys back to its install — so a missed or failed run
// can simply be re-run for that month later; the unique
// (door_system, source_event_id) makes a re-run a no-op for rows already
// stored.
//
// What counts, verified against 2026-08/09 data at every site:
// - Kisi: lock.unlock by a User. Unlocks with no actor are the exit
//   button (they pair one-to-one with controller_input.triggered), and a
//   reader tap logs its own lock.unlock, so reader.access isn't counted
//   separately.
// - PDK: device.input.cardread with result allowed/multiallowed (entry)
//   or denied. Every other result/event is door state, not a person.

const KISI_BASE = "https://api.kisi.io";
const TIMEOUT_MS = 20000;
const UPSERT_CHUNK = 500;

export interface SiteSyncResult {
  gym: string;
  doorSystem: "kisi" | "pdk";
  rows: number;
  error?: string;
}

interface DoorEntryRow {
  gym: string;
  door_system: "kisi" | "pdk";
  source_event_id: string;
  occurred_at: string;
  outcome: "entry" | "denied";
  holder_id: string | null;
  holder_name: string | null;
  holder_email: string | null;
  door_name: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function previousMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const lastDay = new Date(Date.UTC(y, m, 0));
  return {
    startIso: start.toISOString(),
    endIso: new Date(Date.UTC(y, m, 1) - 1000).toISOString(),
    startDate: start.toISOString().slice(0, 10),
    stopDate: lastDay.toISOString().slice(0, 10),
  };
}

async function storeRows(rows: DoorEntryRow[]): Promise<void> {
  const admin = createAdminClient();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await admin
      .from("door_entries")
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "door_system,source_event_id", ignoreDuplicates: true });
    if (error) {
      throw new Error(`door_entries upsert failed: ${error.message}`);
    }
  }
}

// ---- Kisi -----------------------------------------------------------------

interface KisiEvent {
  uuid: string;
  type: string;
  actor_type: string | null;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  object_name: string | null;
  success: boolean;
  created_at: string;
}

interface KisiEventSet {
  id: number;
  status: "in_progress" | "finished" | "failed";
  events?: KisiEvent[];
  cursor?: string | null;
}

function kisiHeaders() {
  const key = process.env.KISI_API_KEY;
  if (!key) {
    throw new Error("KISI_API_KEY is not configured");
  }
  return { Authorization: `KISI-LOGIN ${key}`, Accept: "application/json", "Content-Type": "application/json" };
}

// Kisi rate-limits event set creation (hit a 429 on the 5th set within a
// minute, 2026-09-25) — back off and retry rather than fail the site.
async function kisiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers: kisiHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status !== 429 || attempt >= 5) {
      return res;
    }
    await sleep(15000);
  }
}

async function fetchKisiMonth(placeId: number, month: string): Promise<KisiEvent[]> {
  const { startIso, endIso } = monthBounds(month);
  const createRes = await kisiFetch(`${KISI_BASE}/event_sets`, {
    method: "POST",
    body: JSON.stringify({
      event_set: {
        interval: `${startIso}/${endIso}`,
        place_id: placeId,
        event_type: "lock.unlock",
        event_actor_type: "User",
      },
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Kisi event set create failed: ${createRes.status}: ${await createRes.text()}`);
  }
  let set = (await createRes.json()) as KisiEventSet;

  for (let i = 0; set.status === "in_progress" && i < 60; i++) {
    await sleep(2000);
    const res = await kisiFetch(`${KISI_BASE}/event_sets/${set.id}?limit=1`);
    if (!res.ok) {
      throw new Error(`Kisi event set poll failed: ${res.status}`);
    }
    set = (await res.json()) as KisiEventSet;
  }
  if (set.status !== "finished") {
    throw new Error(`Kisi event set ${set.id} ended as ${set.status}`);
  }

  const events: KisiEvent[] = [];
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ limit: "250", ...(cursor ? { cursor } : {}) });
    const res = await kisiFetch(`${KISI_BASE}/event_sets/${set.id}?${params}`);
    if (!res.ok) {
      throw new Error(`Kisi event set page failed: ${res.status}: ${await res.text()}`);
    }
    const page = (await res.json()) as KisiEventSet;
    const pageEvents = page.events ?? [];
    events.push(...pageEvents);
    if (!page.cursor || pageEvents.length === 0 || page.cursor === cursor) {
      break;
    }
    cursor = page.cursor;
  }
  return events;
}

async function syncKisiSite(placeId: number, gym: string, month: string): Promise<number> {
  const events = await fetchKisiMonth(placeId, month);
  const rows: DoorEntryRow[] = events
    // Server-side filters already ask for this; re-checked so a changed
    // filter behaviour on Kisi's side can't let exit-button events in.
    .filter((e) => e.type === "lock.unlock" && e.actor_type === "User")
    .map((e) => ({
      gym,
      door_system: "kisi",
      source_event_id: e.uuid,
      occurred_at: e.created_at,
      outcome: e.success ? "entry" : "denied",
      holder_id: e.actor_id != null ? String(e.actor_id) : null,
      holder_name: e.actor_name,
      holder_email: e.actor_email?.toLowerCase() ?? null,
      door_name: e.object_name,
    }));
  await storeRows(rows);
  return rows.length;
}

// ---- PDK ------------------------------------------------------------------

interface PdkReportEvent {
  occurred: number;
  event: string;
  result: string | null;
  details?: { holderId?: string; holderName?: string; deviceId?: string; deviceName?: string };
}

interface PdkReportMeta {
  id: string;
  status: string;
  creator?: string;
  filters?: { type: string; startDate?: string; stopDate?: string }[];
}

const PDK_ENTRY_RESULTS = new Set(["device.request.allowed", "device.request.multiallowed"]);

async function fetchPdkMonth(systemId: string, month: string): Promise<PdkReportEvent[]> {
  const { startDate, stopDate } = monthBounds(month);
  const token = await getSystemToken(systemId);
  const base = `https://systems.pdk.io/${systemId}/reports/events`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const genRes = await fetch(`${base}/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filters: [{ type: "occurred", period: "custom", startDate, stopDate }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!genRes.ok) {
    throw new Error(`PDK report generate failed: ${genRes.status}: ${await genRes.text()}`);
  }

  // generate returns 204 with no body — the new report is found in the
  // request list (newest first), matched on our own date range.
  const listRes = await fetch(`${base}/requests`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!listRes.ok) {
    throw new Error(`PDK report list failed: ${listRes.status}`);
  }
  const reports = (await listRes.json()) as PdkReportMeta[];
  const report = reports.find((r) =>
    r.filters?.some((f) => f.type === "occurred" && f.startDate?.startsWith(startDate) && f.stopDate?.startsWith(stopDate))
  );
  if (!report) {
    throw new Error("PDK report not found after generate");
  }

  try {
    let meta = report;
    for (let i = 0; (meta.status === "pending" || meta.status === "executing") && i < 60; i++) {
      await sleep(2000);
      const res = await fetch(`${base}/requests/${report.id}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) {
        throw new Error(`PDK report poll failed: ${res.status}`);
      }
      meta = (await res.json()) as PdkReportMeta;
    }
    if (meta.status !== "finished") {
      // finishedTruncated would silently drop events — fail loudly instead.
      throw new Error(`PDK report ended as ${meta.status}`);
    }

    const events: PdkReportEvent[] = [];
    for (let page = 0; ; page++) {
      const res = await fetch(`${base}/requests/${report.id}/view?page=${page}&per_page=100`, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`PDK report page failed: ${res.status}`);
      }
      const rows = (await res.json()) as PdkReportEvent[];
      events.push(...rows);
      if (rows.length < 100) {
        break;
      }
    }
    return events;
  } finally {
    await fetch(`${base}/requests/${report.id}`, { method: "DELETE", headers, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(
      () => undefined
    );
  }
}

async function fetchPdkHolderEmails(systemId: string, holderIds: string[]): Promise<Map<string, string | null>> {
  const token = await getSystemToken(systemId);
  const emails = new Map<string, string | null>();
  for (const id of holderIds) {
    const res = await fetch(`https://systems.pdk.io/${systemId}/holders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // A holder deleted since the event still has a valid entry — keep the
    // row, just without an email to match on.
    const holder = res.ok ? ((await res.json()) as { email?: string | null }) : null;
    emails.set(id, holder?.email?.toLowerCase() ?? null);
  }
  return emails;
}

async function syncPdkSite(systemId: string, gym: string, month: string): Promise<number> {
  const events = (await fetchPdkMonth(systemId, month)).filter(
    (e) => e.event === "device.input.cardread" && e.result != null && (PDK_ENTRY_RESULTS.has(e.result) || e.result === "device.request.denied")
  );
  const holderIds = [...new Set(events.map((e) => e.details?.holderId).filter((id): id is string => !!id))];
  const emails = await fetchPdkHolderEmails(systemId, holderIds);

  const rows: DoorEntryRow[] = events.map((e) => ({
    gym,
    door_system: "pdk",
    source_event_id: [e.occurred, e.details?.deviceId ?? "", e.details?.holderId ?? "", e.result].join(":"),
    occurred_at: new Date(e.occurred).toISOString(),
    outcome: e.result && PDK_ENTRY_RESULTS.has(e.result) ? "entry" : "denied",
    holder_id: e.details?.holderId ?? null,
    holder_name: e.details?.holderName ?? null,
    holder_email: e.details?.holderId ? (emails.get(e.details.holderId) ?? null) : null,
    door_name: e.details?.deviceName ?? null,
  }));
  await storeRows(rows);
  return rows.length;
}

// ---- Entry point ----------------------------------------------------------

export async function syncDoorHistoryMonth(month: string): Promise<SiteSyncResult[]> {
  const admin = createAdminClient();
  const [{ data: kisiSites, error: kisiErr }, { data: pdkSites, error: pdkErr }] = await Promise.all([
    admin.from("kisi_place_gyms").select("place_id, gym"),
    admin.from("gym_pdk_mapping").select("gym, system_id"),
  ]);
  if (kisiErr || pdkErr) {
    throw new Error(`Site lookup failed: ${(kisiErr ?? pdkErr)?.message}`);
  }

  const results: SiteSyncResult[] = [];
  // Sequential on purpose: Kisi rate-limits event set creation, and one
  // site failing shouldn't stop the others.
  for (const site of kisiSites ?? []) {
    try {
      results.push({ gym: site.gym, doorSystem: "kisi", rows: await syncKisiSite(site.place_id, site.gym, month) });
    } catch (err) {
      results.push({ gym: site.gym, doorSystem: "kisi", rows: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const site of pdkSites ?? []) {
    try {
      results.push({ gym: site.gym, doorSystem: "pdk", rows: await syncPdkSite(site.system_id, site.gym, month) });
    } catch (err) {
      results.push({ gym: site.gym, doorSystem: "pdk", rows: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
