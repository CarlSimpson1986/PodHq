"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { AdminUserRow } from "@/lib/data/admin";

const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";

export function UserList({
  users,
  currentUserId,
  onChanged,
}: {
  users: AdminUserRow[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);

  const deactivatedCount = users.filter((u) => u.banned).length;
  const visibleUsers = showDeactivated ? users : users.filter((u) => !u.banned);

  async function toggleBanned(userId: string, banned: boolean) {
    setError(null);
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not update this account.");
        return;
      }
      onChanged();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function clearLockout(userId: string) {
    setError(null);
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/unlock`, { method: "POST" });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not clear lockout.");
        return;
      }
      onChanged();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card-glass p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Users ({visibleUsers.length})</p>
        {deactivatedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDeactivated((v) => !v)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            {showDeactivated ? "Hide deactivated" : `Show deactivated (${deactivatedCount})`}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Email</th>
              <th className="py-2 pr-3 font-normal">Role</th>
              <th className="py-2 pr-3 font-normal">Gym</th>
              <th className="py-2 pr-3 font-normal">Status</th>
              <th className="py-2 pr-3 font-normal">Created</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((u) => (
              <tr key={u.userId} className="border-b border-card-border last:border-0">
                <td className="py-2 pr-3 text-foreground">{u.email}</td>
                <td className="py-2 pr-3 capitalize text-muted-foreground">{u.role}</td>
                <td className="py-2 pr-3 text-muted-foreground">{u.gym ?? "All gyms"}</td>
                <td className="py-2 pr-3">
                  <span className={u.banned ? "text-danger" : "text-muted-foreground"}>
                    {u.banned ? "Deactivated" : "Active"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                <td className="py-2 text-right">
                  {u.userId === currentUserId ? (
                    <span className="text-xs text-muted-foreground">You</span>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === u.userId}
                        onClick={() => clearLockout(u.userId)}
                        className={secondaryButtonClass}
                        title="Clear a login lockout so the account can sign in with its password again"
                      >
                        {busyId === u.userId ? "..." : "Clear lockout"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === u.userId}
                        onClick={() => toggleBanned(u.userId, !u.banned)}
                        className={secondaryButtonClass}
                      >
                        {busyId === u.userId ? "..." : u.banned ? "Reactivate" : "Deactivate"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
