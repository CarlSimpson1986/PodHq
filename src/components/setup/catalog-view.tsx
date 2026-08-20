"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CatalogItem, CatalogItemType } from "@/lib/data/catalog";
import type { GymName } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass = "rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

function formatGBP(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

// Derived, not stored — categorizing purely from creditType/creditTypeSecondary
// avoids a whole extra "category" column/migration. Combo items (secondary
// set) always group separately regardless of their primary type, since
// they're a genuinely different product from a plain Gym or Recovery Room
// item even though they share a primary credit type with one of them.
const CATEGORY_ORDER = ["Gym", "Recovery Room", "Combination"] as const;
function categoryFor(item: CatalogItem): (typeof CATEGORY_ORDER)[number] {
  if (item.creditTypeSecondary) return "Combination";
  if (item.creditType === "recovery") return "Recovery Room";
  return "Gym";
}

interface FormState {
  name: string;
  label: string;
  credits: string;
  priceGBP: string;
  oneTimePerMember: boolean;
}

const emptyForm: FormState = { name: "", label: "", credits: "", priceGBP: "", oneTimePerMember: false };

// Not a closed set in the schema (see CatalogItem's own comment) — plain
// text so a gym adding a third resource type someday needs no code
// change here, just typing a new value in. Defaults to "pod" when left
// blank, matching every existing item.
const DEFAULT_CREDIT_TYPE = "pod";

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
  // Create-only — not part of FormState/parseForm since it's never
  // editable after creation (see createCatalogItem's own comment).
  const [addCreditType, setAddCreditType] = useState(DEFAULT_CREDIT_TYPE);
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
        body: JSON.stringify({ gym, type, creditType: addCreditType.trim() || DEFAULT_CREDIT_TYPE, ...parsed }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not create this item.");
        return;
      }
      setAddForm(emptyForm);
      setAddCreditType(DEFAULT_CREDIT_TYPE);
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
            <input
              placeholder={`Credit type (default "${DEFAULT_CREDIT_TYPE}")`}
              value={addCreditType}
              onChange={(e) => setAddCreditType(e.target.value)}
              className={inputClass}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Which credit balance this item grants — most gyms only ever use &quot;pod&quot;. A gym with more than one
            bookable resource type (e.g. a wellness room billed separately) uses a matching second credit type there.
            Can&apos;t be changed once created.
          </p>
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
              <th className="py-2 font-medium">Credit type</th>
              <th className="py-2 font-medium">Price</th>
              <th className="py-2 font-medium">One-time</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          {CATEGORY_ORDER.filter((cat) => items.some((i) => categoryFor(i) === cat)).map((cat) => (
              <tbody key={cat}>
                <tr>
                  <td colSpan={8} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat}
                  </td>
                </tr>
                {items
                  .filter((i) => categoryFor(i) === cat)
                  .map((item) => {
                    const isEditing = editingId === item.id;
                    const isCombo = !!item.creditTypeSecondary;
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
                              {/* Secondary combo credits aren't editable via this form yet —
                                  shown read-only so staff don't think it's been dropped. */}
                              {isCombo && (
                                <span className="ml-1 text-muted-foreground">
                                  + {item.creditsSecondary} {item.creditTypeSecondary}
                                </span>
                              )}
                            </td>
                            {/* Not editable — set once at creation, see the form's own note above. */}
                            <td className="py-2 text-muted-foreground">
                              {item.creditType}
                              {isCombo && ` + ${item.creditTypeSecondary}`}
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
                            <td className="py-2 text-muted-foreground">{item.label}</td>
                            <td className="py-2 tabular-nums text-foreground">
                              {item.credits}
                              {isCombo && <span className="text-muted-foreground"> + {item.creditsSecondary}</span>}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {item.creditType}
                              {isCombo && ` + ${item.creditTypeSecondary}`}
                            </td>
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
          ))}
        </table>
      )}
    </section>
  );
}

export function CatalogView({
  gym,
  initialItems,
}: {
  gym: GymName | null;
  initialItems: CatalogItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // initialItems already covers the first render (owner's fixed gym, or
  // admin landing with nothing selected) — only refetch on gym changes
  // that happen after mount, so switching the shared selector doesn't
  // cause a spurious extra fetch/loading-flash on load.
  const isFirstRender = useRef(true);

  const refetch = useCallback((nextGym: GymName | null) => {
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
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch(gym);
  }, [gym, refetch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Setup — {gym ?? "All gyms"}</h1>
        <p className="text-sm text-muted-foreground">
          Credit packs and membership tiers staff can sell and members can buy. Disabling an item stops new sales but keeps
          its history intact — price changes never affect purchases or memberships already sold.
        </p>
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
