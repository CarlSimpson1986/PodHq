"use client";

import { useState } from "react";
import type { CatalogItem, CatalogItemType } from "@/lib/data/catalog";

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
}

const emptyForm: FormState = { name: "", label: "", credits: "", priceGBP: "" };

function CatalogSection({
  type,
  title,
  creditsLabel,
  items,
  onChanged,
}: {
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
    setEditForm({ name: item.name, label: item.label, credits: String(item.credits), priceGBP: String(item.priceGBP) });
    setError("");
  }

  function parseForm(form: FormState): { name: string; label: string; credits: number; priceGBP: number } | null {
    const credits = Number(form.credits);
    const priceGBP = Number(form.priceGBP);
    if (!form.name.trim() || !form.label.trim() || !Number.isInteger(credits) || credits <= 0 || !(priceGBP > 0)) return null;
    return { name: form.name.trim(), label: form.label.trim(), credits, priceGBP };
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
        body: JSON.stringify({ type, ...parsed }),
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
        body: JSON.stringify(parsed),
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
        body: JSON.stringify({ enabled }),
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

      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-card-border text-xs text-muted-foreground">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Label</th>
            <th className="py-2 font-medium">{creditsLabel}</th>
            <th className="py-2 font-medium">Price</th>
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
    </section>
  );
}

export function CatalogView({ initialItems }: { initialItems: CatalogItem[] }) {
  const [items, setItems] = useState(initialItems);

  async function refetch() {
    const res = await fetch("/api/setup/catalog");
    const body = await res.json();
    if (body.status === "ok") setItems(body.items);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Catalog</h1>
        <p className="text-sm text-muted-foreground">
          Credit packs and membership tiers staff can sell and members can buy. Disabling an item stops new sales but keeps
          its history intact — price changes never affect purchases or memberships already sold.
        </p>
      </div>
      <CatalogSection
        type="credit_pack"
        title="Credit packs"
        creditsLabel="Credits"
        items={items.filter((i) => i.type === "credit_pack")}
        onChanged={refetch}
      />
      <CatalogSection
        type="membership"
        title="Membership tiers"
        creditsLabel="Credits / month"
        items={items.filter((i) => i.type === "membership")}
        onChanged={refetch}
      />
    </div>
  );
}
