"use client";

import { useState, useTransition } from "react";
import type { AdminUserRow, SystemStatus } from "@/lib/data/admin";
import { SystemStatusCard } from "./system-status-card";
import { CreateOwnerForm } from "./create-owner-form";
import { UserList } from "./user-list";
import { ExportReportsCard } from "./export-reports-card";

interface AdminViewProps {
  currentUserId: string;
  initialUsers: AdminUserRow[];
  initialStatus: SystemStatus;
}

export function AdminView({ currentUserId, initialUsers, initialStatus }: AdminViewProps) {
  const [users, setUsers] = useState(initialUsers);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function refetch() {
    setError(null);
    startTransition(async () => {
      try {
        const [usersRes, statusRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/status"),
        ]);
        const usersBody = await usersRes.json();
        const statusBody = await statusRes.json();

        if (usersBody.status !== "ok" || statusBody.status !== "ok") {
          setError(usersBody.message ?? statusBody.message ?? "Could not refresh.");
          return;
        }
        setUsers(usersBody.users);
        setStatus(statusBody.systemStatus);
      } catch {
        setError("Something went wrong refreshing this page.");
      }
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Admin</h1>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 space-y-4">
        <SystemStatusCard status={status} />
        <CreateOwnerForm onCreated={refetch} />
        <UserList users={users} currentUserId={currentUserId} onChanged={refetch} />
        <ExportReportsCard />
      </div>
    </div>
  );
}
