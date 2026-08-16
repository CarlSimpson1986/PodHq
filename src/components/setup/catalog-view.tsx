"use client";

import { useState, useTransition } from "react";
import type { CatalogItem, CatalogItemType } from "@/lib/data/catalog";
import type { GymName } from "@/lib/data/types";
import { GymSelect } from "@/components/ui/gym-select";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass = "rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

function formatGBP(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

interface FormState {
  name: string;
  label: string;
  credits: string;
  priceGBP: string;
  oneTimePerMember: boolean;
}

const emptyForm: FormState = { name: "", label: "", credits: "", priceGBP: "", oneTimePerMember: false };

function CatalogSection({
  gym,
  type,
  title,
  creditsLabel,
  items,
  onChanged,
}: {
  gym: GymName;
  type: CatalogItemType;
  title: string;
  creditsLabel: string;
  items: CatalogItem[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function startEdit(item: CatalogItem) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      label: item.label,
      credits: String(item.credits),
      priceGBP: String(item.priceGBP),
      oneTimePerMember: item.oneTimePerMember,
    });
    setError("");
  }

  function parseForm(
    form: FormState
  ): { name: string; label: string; credits: number; priceGBP: number; oneTimePerMember: boolean } | null {
    const credits = Number(form.credits);
    const priceGBP = Number(form.priceGBP);
    if (!form.name.trim() || !form.label.trim() || !Number.isInteger(credits) || credits <= 0 || !(priceGBP > 0)) return null;
    return { name: form.name.trim(), label: form.label.trim(), credits, priceGBP, oneTimePerMember: form.oneTimePerMember };
  }

  async function handleCreate() {
    const parsed = parseForm(addForm);
    if (!parsed) {
      setError("Fill in a name, label, whole-number credits, and a price above £0.");
      return;
    }
    setError("");
    setBusyId(-1);
    try {
      const res = await fetch("/api/setup/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, type, ...parsed }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not create this item.");
        return;
      }
      setAddForm(emptyForm);
      setAdding(false);
      onChanged();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveEdit(id: number) {
    const parsed = parseForm(editForm);
    if (!parsed) {
      setError("Fill in a name, label, whole-number credits, and a price above £0.");
      return;
    }
    setError("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/setup/catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, ...parsed }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not save changes.");
        return;
      }
      setEditingId(null);
      onChanged();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(id: number, enabled: boolean) {
    setError("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/setup/catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, enabled }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not update this item.");
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
    <section className="card-glass p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass}>
            Add new
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-md border border-card-border p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              placeholder="Name"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder="Label (e.g. 5 credits)"
              value={addForm.label}
              onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={creditsLabel}
              type="number"
              value={addForm.credits}
              onChange={(e) => setAddForm((f) => ({ ...f, credits: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder="Price (£)"
              type="number"
              step="0.01"
              value={addForm.priceGBP}
              onChange={(e) => setAddForm((f) => ({ ...f, priceGBP: e.target.value }))}
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={addForm.oneTimePerMember}
              onChange={(e) => setAddForm((f) => ({ ...f, oneTimePerMember: e.target.checked }))}
            />
            One-time per member (e.g. an intro offer — a member can only ever buy this once; staff can still sell/grant it again)
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={busyId === -1} className={buttonClass}>
              {busyId === -1 ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddForm(emptyForm);
                setError("");
              }}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-card-border text-xs text-muted-foreground">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Label</th>
              <th className="py-2 font-medium">{creditsLabel}</th>
              <th className="py-2 font-medium">Price</th>
              <th className="py-2 font-medium">One-time</th>
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
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className={`${inputClass} w-full`}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          value={editForm.label}
                          onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                          className={`${inputClass} w-full`}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          value={editForm.credits}
                          onChange={(e) => setEditForm((f) => ({ ...f, credits: e.target.value }))}
                          className={`${inputClass} w-20`}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.priceGBP}
                          onChange={(e) => setEditForm((f) => ({ ...f, priceGBP: e.target.value }))}
                          className={`${inputClass} w-24`}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={editForm.oneTimePerMember}
                          onChange={(e) => setEditForm((f) => ({ ...f, oneTimePerMember: e.target.checked }))}
                        />
                      </td>
                      <td className="py-2 text-muted-foreground">{item.enabled ? "Enabled" : "Disabled"}</td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => handleSaveEdit(item.id)} disabled={busyId === item.id} className={buttonClass}>
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
                      <td className="py-2 text-muted-foreground">{item.label}</td>
                      <td className="py-2 tabular-nums text-foreground">{item.credits}</td>
                      <td className="py-2 tabular-nums text-foreground">{formatGBP(item.priceGBP)}</td>
                      <td className="py-2 text-muted-foreground">{item.oneTimePerMember ? "Yes" : "—"}</td>
                      <td className="py-2">
                        <span className={item.enabled ? "text-foreground" : "text-muted-foreground"}>
                          {item.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => startEdit(item)} className={secondaryButtonClass}>
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
    </section>
  );
}

export function CatalogView({
  role,
  initialGym,
  initialItems,
}: {
  role: "admin" | "owner";
  initialGym: GymName | null;
  initialItems: CatalogItem[];
}) {
  const [gym, setGym] = useState<GymName | null>(initialGym);
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextGym: GymName | null) {
    setError(null);
    if (!nextGym) {
      setItems([]);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/setup/catalog?gym=${encodeURIComponent(nextGym)}`);
        const body = await res.json();
        if (body.status !== "ok") {
          setError(body.message ?? "Could not load the catalog.");
          return;
        }
        setItems(body.items);
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  function handleGymChange(next: GymName | null) {
    setGym(next);
    refetch(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Setup — {gym ?? "All gyms"}</h1>
        <p className="text-sm text-muted-foreground">
          Credit packs and membership tiers staff can sell and members can buy. Disabling an item stops new sales but keeps
          its history intact — price changes never affect purchases or memberships already sold.
        </p>
        {role === "admin" && (
          <div className="mt-3">
            <GymSelect value={gym} onChange={handleGymChange} disabled={isPending} />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {isPending && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!gym ? (
        <p className="text-sm text-muted-foreground">Select a gym above to manage its catalog.</p>
      ) : (
        <>
          <CatalogSection
            gym={gym}
            type="credit_pack"
            title="Credit packs"
            creditsLabel="Credits"
            items={items.filter((i) => i.type === "credit_pack")}
            onChanged={() => refetch(gym)}
          />
          <CatalogSection
            gym={gym}
            type="membership"
            title="Membership tiers"
            creditsLabel="Credits / month"
            items={items.filter((i) => i.type === "membership")}
            onChanged={() => refetch(gym)}
          />
        </>
      )}
    </div>
  );
}
