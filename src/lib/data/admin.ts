import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";

export interface AdminUserRow {
  userId: string;
  email: string;
  gym: GymName | null;
  role: "admin" | "owner";
  banned: boolean;
  createdAt: string;
}

export interface SystemStatus {
  rowCounts: {
    Revenue: number;
    attendance: number;
    users_gyms: number;
    ad_spend: number;
    gym_outgoings: number;
  };
  /** Most recent created_at across Revenue/attendance — the only two
   *  GymFlow/UiPath-fed tables. There's no dedicated sync-log table, so
   *  this is a proxy for "when did data last land," not the actual
   *  upstream export timestamp. Null if both tables are empty. */
  lastSync: string | null;
}

/**
 * Supabase's ban is never truly "permanent" — there's no infinite value,
 * so a very long duration (~100 years) is the documented convention for
 * an indefinite ban. `ban_duration: "none"` clears it.
 */
const INDEFINITE_BAN = "876000h";

const AUTH_LIST_PAGE_SIZE = 200;

/**
 * All `users_gyms` rows joined with their auth account's email + ban
 * status. Pages through the Auth Admin API rather than assuming one page
 * covers everyone — same discipline as the Revenue/attendance pagination
 * rule, even though current scale (a handful of franchisees) is nowhere
 * near it yet.
 */
export async function getAllUsers(): Promise<AdminUserRow[]> {
  const admin = createAdminClient();

  const { data: gymRows, error: gymError } = await admin
    .from("users_gyms")
    .select("user_id, gym, role")
    .order("gym", { ascending: true, nullsFirst: true });
  if (gymError) throw gymError;

  const scopeByUserId = new Map(gymRows.map((r) => [r.user_id as string, r]));

  const authUsersById = new Map<string, { email: string; banned: boolean; createdAt: string }>();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_LIST_PAGE_SIZE });
    if (error) throw error;

    for (const u of data.users) {
      authUsersById.set(u.id, {
        email: u.email ?? "",
        banned: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
        createdAt: u.created_at,
      });
    }

    if (data.users.length < AUTH_LIST_PAGE_SIZE) break;
    page += 1;
  }

  return gymRows
    .map((row) => {
      const authUser = authUsersById.get(row.user_id as string);
      if (!authUser) return null; // orphaned users_gyms row — auth account deleted outside the app
      return {
        userId: row.user_id as string,
        email: authUser.email,
        gym: row.gym as GymName | null,
        role: row.role as "admin" | "owner",
        banned: authUser.banned,
        createdAt: authUser.createdAt,
      };
    })
    .filter((r): r is AdminUserRow => r !== null);
}

/**
 * Invites a new owner by email (Supabase sends the invite; they land on
 * /auth/callback → /login/set-password — the same flow Stage 2 already
 * hardened, not a new one) and scopes them to one gym. Admin accounts are
 * deliberately not creatable from here — the most privileged role stays a
 * manual, out-of-band step.
 */
export async function createOwnerAccount(email: string, gym: GymName, origin: string): Promise<void> {
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback`,
  });
  if (error) throw error;

  const { error: insertError } = await admin
    .from("users_gyms")
    .insert({ user_id: data.user.id, gym, role: "owner" });
  if (insertError) throw insertError;
}

export async function setUserBanned(userId: string, banned: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? INDEFINITE_BAN : "none",
  });
  if (error) throw error;
}

async function mostRecentCreatedAt(table: "Revenue" | "attendance"): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}

async function countRows(table: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const [revenueCount, attendanceCount, usersGymsCount, adSpendCount, outgoingsCount, revenueLast, attendanceLast] =
    await Promise.all([
      countRows("Revenue"),
      countRows("attendance"),
      countRows("users_gyms"),
      countRows("ad_spend"),
      countRows("gym_outgoings"),
      mostRecentCreatedAt("Revenue"),
      mostRecentCreatedAt("attendance"),
    ]);

  const candidates = [revenueLast, attendanceLast].filter((v): v is string => v !== null);
  const lastSync = candidates.length > 0 ? candidates.sort().at(-1)! : null;

  return {
    rowCounts: {
      Revenue: revenueCount,
      attendance: attendanceCount,
      users_gyms: usersGymsCount,
      ad_spend: adSpendCount,
      gym_outgoings: outgoingsCount,
    },
    lastSync,
  };
}
