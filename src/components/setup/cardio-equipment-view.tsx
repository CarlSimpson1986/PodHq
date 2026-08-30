"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CardioEquipment } from "@/lib/data/cardio-equipment";
import type { GymName } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass = "rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

// Cardio equipment logging (2026-08-30) — same owner-editable-with-
// admin-fallback pattern as the pricing catalog next to it on this page,
// but much simpler data (just a name), so this is a flat list rather
// than CatalogView/CatalogSection's two-type/categorised table.
export function CardioEquipmentView({ gym, initialItems }: { gym: GymName | null; initialItems: CardioEquipment[] }) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  // Same reasoning as CatalogView's own isFirstRender ref — initialItems
  // already covers the first render, only refetch on gym changes after
  // mount.
  const isFirstRender = useRef(true);

  const refetch = useCallback((nextGym: GymName | null) => {
    setError(null);
    if (!nextGym) {
      setItems([]);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/setup/cardio-equipment?gym=${encodeURIComponent(nextGym)}`);
        const body = await res.json();
        if (body.status !== "ok") {
          setError(body.message ?? "Could not load the equipment list.");
          return;
        }
        setItems(body.items);
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch(gym);
  }, [gym, refetch]);

  async function handleCreate() {
    if (!gym) return;
    const name = addName.trim();
    if (!name) {
      setError("Enter a name for the equipment.");
      return;
    }
    setError(null);
    setBusyId(-1);
    try {
      const res = await fetch("/api/setup/cardio-equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, name }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not add this equipment.");
        return;
      }
      setAddName("");
      setAdding(false);
      refetch(gym);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveEdit(id: number) {
    if (!gym) return;
    const name = editName.trim();
    if (!name) {
      setError("Enter a name for the equipment.");
      return;
    }
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/setup/cardio-equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, name }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not save changes.");
        return;
      }
      setEditingId(null);
      refetch(gym);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(id: number, enabled: boolean) {
    if (!gym) return;
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/setup/cardio-equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, enabled }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not update this equipment.");
        return;
      }
      refetch(gym);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card-glass p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Cardio equipment</h2>
          <p className="text-xs text-muted-foreground">
            Named machines members can log against (e.g. &quot;Treadmill 1&quot;). Disabling one stops it appearing for
            members but keeps past logs intact.
          </p>
        </div>
        {gym && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass}>
            Add new
          </button>
        )}
      </div>

      {isPending && <p className="mt-2 text-sm text-muted-foreground">Loading...</p>}

      {!gym ? (
        <p className="mt-3 text-sm text-muted-foreground">Select a gym above to manage its cardio equipment.</p>
      ) : (
        <>
          {adding && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-card-border p-3">
              <input
                placeholder="e.g. Treadmill 1"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className={`${inputClass} flex-1`}
              />
              <button type="button" onClick={handleCreate} disabled={busyId === -1} className={buttonClass}>
                {busyId === -1 ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setAddName("");
                  setError(null);
                }}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-danger">{error}</p>}

          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No cardio equipment yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-card-border text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <tr key={item.id} className="border-b border-card-border last:border-b-0">
                      {isEditing ? (
                        <>
                          <td className="py-2">
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputClass} w-full`} />
                          </td>
                          <td className="py-2 text-muted-foreground">{item.enabled ? "Enabled" : "Disabled"}</td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(item.id)}
                                disabled={busyId === item.id}
                                className={buttonClass}
                              >
                                {busyId === item.id ? "Saving..." : "Save"}
                              </button>
                              <button type="button" onClick={() => setEditingId(null)} className={secondaryButtonClass}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 text-foreground">{item.name}</td>
                          <td className="py-2">
                            <span className={item.enabled ? "text-foreground" : "text-muted-foreground"}>
                              {item.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditName(item.name);
                                  setError(null);
                                }}
                                className={secondaryButtonClass}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggle(item.id, !item.enabled)}
                                disabled={busyId === item.id}
                                className={secondaryButtonClass}
                              >
                                {busyId === item.id ? "Working..." : item.enabled ? "Disable" : "Enable"}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
