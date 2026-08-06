"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { AdminUserRow } from "@/lib/data/admin";

const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";

const dangerButtonClass =
  "rounded-md border border-danger/50 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50";

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
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ userId: string; email: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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

  async function resetPassword(userId: string, email: string) {
    if (!confirm(`Reset the password for ${email}? Their current password stops working immediately.`)) return;
    setError(null);
    setResetResult(null);
    setCopied(false);
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not reset this account's password.");
        return;
      }
      setResetResult({ email: body.email, password: body.password });
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

  async function confirmDelete() {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.email) return;
    setError(null);
    setBusyId(deleteTarget.userId);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.userId}`, { method: "DELETE" });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not delete this account.");
        return;
      }
      setDeleteTarget(null);
      setDeleteConfirmText("");
      onChanged();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopy() {
    if (!resetResult) return;
    await navigator.clipboard.writeText(resetResult.password);
    setCopied(true);
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

      {deleteTarget && (
        <div className="mt-3 rounded-md border border-danger/50 bg-danger/5 p-3 text-sm">
          <p className="text-foreground">
            Permanently delete <span className="font-semibold">{deleteTarget.email}</span>? This removes their
            login entirely and frees the email up to be re-added later — unlike Deactivate, it can&apos;t be
            undone. Their gym assignment goes with it; audit history is kept but no longer tied to the account.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Type <span className="font-mono">{deleteTarget.email}</span> to confirm.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="flex-1 rounded-md border border-card-border bg-background px-2 py-1.5 text-xs text-foreground"
              placeholder={deleteTarget.email}
              autoFocus
            />
            <button
              type="button"
              disabled={deleteConfirmText !== deleteTarget.email || busyId === deleteTarget.userId}
              onClick={confirmDelete}
              className={dangerButtonClass}
            >
              {busyId === deleteTarget.userId ? "Deleting..." : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmText("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {resetResult && (
        <div className="mt-3 rounded-md border border-card-border bg-background p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-foreground">
              New password for <span className="font-semibold">{resetResult.email}</span>. Send it to them
              yourself — nothing has been emailed, and their old password no longer works.
            </p>
            <button
              type="button"
              onClick={() => setResetResult(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 select-all rounded bg-card-border/30 px-2 py-1 font-mono text-xs text-foreground">
              {resetResult.password}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md border border-card-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-card-border/20"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

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
                        onClick={() => resetPassword(u.userId, u.email)}
                        className={secondaryButtonClass}
                        title="Generate a new random password and force this account to set its own on next login"
                      >
                        {busyId === u.userId ? "..." : "Reset password"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === u.userId}
                        onClick={() => toggleBanned(u.userId, !u.banned)}
                        className={secondaryButtonClass}
                      >
                        {busyId === u.userId ? "..." : u.banned ? "Reactivate" : "Deactivate"}
                      </button>
                      {u.role === "owner" && (
                        <button
                          type="button"
                          disabled={busyId === u.userId}
                          onClick={() => {
                            setDeleteTarget({ userId: u.userId, email: u.email });
                            setDeleteConfirmText("");
                            setError(null);
                          }}
                          className={dangerButtonClass}
                          title="Permanently delete this account so the email can be re-added later"
                        >
                          Delete
                        </button>
                      )}
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
