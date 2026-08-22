"use client";

import { useCallback, useEffect, useState } from "react";
import type { PromoCode, DiscountType, UsageLimitType } from "@/lib/data/promo-codes";
import type { CatalogItem } from "@/lib/data/catalog";
import type { GymName } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass = "rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

function formatDiscount(promoCode: PromoCode) {
  return promoCode.discountType === "percentage" ? `${promoCode.discountValue}%` : `£${promoCode.discountValue.toFixed(2)}`;
}

function formatLimit(promoCode: PromoCode) {
  if (promoCode.usageLimitType === "unlimited") return `Unlimited (${promoCode.redeemedCount} used)`;
  if (promoCode.usageLimitType === "once_per_member") return `Once per member (${promoCode.redeemedCount} used)`;
  return `${promoCode.redeemedCount} / ${promoCode.usageLimitValue} used`;
}

interface FormState {
  code: string;
  discountType: DiscountType;
  discountValue: string;
  usageLimitType: UsageLimitType;
  usageLimitValue: string;
  itemIds: number[];
}

const emptyForm: FormState = {
  code: "",
  discountType: "percentage",
  discountValue: "",
  usageLimitType: "once_per_member",
  usageLimitValue: "",
  itemIds: [],
};

export function PromoCodesView({ gym }: { gym: GymName | null }) {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (nextGym: GymName | null) => {
    if (!nextGym) {
      setPromoCodes([]);
      setCatalogItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [promoCodesRes, catalogRes] = await Promise.all([
        fetch(`/api/setup/promo-codes?gym=${encodeURIComponent(nextGym)}`),
        fetch(`/api/setup/catalog?gym=${encodeURIComponent(nextGym)}`),
      ]);
      const promoCodesBody = await promoCodesRes.json();
      const catalogBody = await catalogRes.json();
      if (promoCodesBody.status !== "ok" || catalogBody.status !== "ok") {
        setError(promoCodesBody.message ?? catalogBody.message ?? "Could not load promo codes.");
        return;
      }
      setPromoCodes(promoCodesBody.promoCodes);
      setCatalogItems(catalogBody.items);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred a tick — same pattern as calendar-view.tsx's fetchRange —
    // so this effect's own setLoading/setPromoCodes calls aren't reachable
    // synchronously from the effect body itself. No initial-render skip
    // (unlike catalog-view.tsx): this component has no server-provided
    // initial data, it always needs to fetch, including on mount.
    queueMicrotask(() => load(gym));
  }, [gym, load]);

  function toggleItem(id: number) {
    setForm((f) => ({ ...f, itemIds: f.itemIds.includes(id) ? f.itemIds.filter((i) => i !== id) : [...f.itemIds, id] }));
  }

  async function handleCreate() {
    if (!gym) return;
    const discountValue = Number(form.discountValue);
    const usageLimitValue = form.usageLimitType === "total_cap" ? Number(form.usageLimitValue) : undefined;
    if (!form.code.trim() || !(discountValue > 0) || form.itemIds.length === 0) {
      setError("Fill in a code, a positive discount value, and select at least one item.");
      return;
    }
    if (form.usageLimitType === "total_cap" && !(usageLimitValue && usageLimitValue > 0)) {
      setError("A total-cap promo code needs a positive usage limit.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/setup/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gym,
          code: form.code.trim(),
          discountType: form.discountType,
          discountValue,
          usageLimitType: form.usageLimitType,
          ...(usageLimitValue ? { usageLimitValue } : {}),
          itemIds: form.itemIds,
        }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not create this promo code.");
        return;
      }
      setForm(emptyForm);
      setAdding(false);
      load(gym);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(promoCode: PromoCode) {
    if (!gym) return;
    setBusyId(promoCode.id);
    setError("");
    try {
      const res = await fetch(`/api/setup/promo-codes/${promoCode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, enabled: !promoCode.enabled }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not update this promo code.");
        return;
      }
      load(gym);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  function itemLabel(id: number) {
    const item = catalogItems.find((i) => i.id === id);
    return item ? `${item.name} (${item.type === "membership" ? "membership" : "credit pack"})` : `#${id}`;
  }

  if (!gym) {
    return (
      <section className="card-glass p-4">
        <h2 className="text-sm font-semibold text-foreground">Promo Codes</h2>
        <p className="mt-3 text-sm text-muted-foreground">Select a gym above to manage its promo codes.</p>
      </section>
    );
  }

  return (
    <section className="card-glass p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Promo Codes</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Members redeem these themselves at checkout — each code applies only to the specific items you pick below.
          </p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass}>
            Add new
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 space-y-3 rounded-md border border-card-border p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              placeholder="Code (e.g. LAUNCH20)"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className={inputClass}
            />
            <select
              value={form.discountType}
              onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as DiscountType }))}
              className={inputClass}
            >
              <option value="percentage">Percentage off</option>
              <option value="fixed">£ off</option>
            </select>
            <input
              placeholder={form.discountType === "percentage" ? "e.g. 20" : "e.g. 10.00"}
              type="number"
              step="0.01"
              value={form.discountValue}
              onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
              className={inputClass}
            />
            <select
              value={form.usageLimitType}
              onChange={(e) => setForm((f) => ({ ...f, usageLimitType: e.target.value as UsageLimitType }))}
              className={inputClass}
            >
              <option value="once_per_member">Once per member</option>
              <option value="total_cap">Fixed total cap</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>

          {form.usageLimitType === "total_cap" && (
            <input
              placeholder="Total redemptions allowed (e.g. 50)"
              type="number"
              value={form.usageLimitValue}
              onChange={(e) => setForm((f) => ({ ...f, usageLimitValue: e.target.value }))}
              className={`${inputClass} w-56`}
            />
          )}

          <div>
            <p className="mb-1 text-xs text-muted-foreground">Applies to (select at least one):</p>
            <div className="flex flex-wrap gap-2">
              {catalogItems.map((item) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                    form.itemIds.includes(item.id) ? "border-accent bg-accent/10 text-foreground" : "border-card-border text-muted-foreground"
                  }`}
                >
                  <input type="checkbox" checked={form.itemIds.includes(item.id)} onChange={() => toggleItem(item.id)} className="sr-only" />
                  {item.name} ({item.type === "membership" ? "membership" : "pack"})
                </label>
              ))}
              {catalogItems.length === 0 && <p className="text-xs text-muted-foreground">No catalog items for this gym yet.</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={saving} className={buttonClass}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setForm(emptyForm);
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
      {loading && <p className="mt-2 text-xs text-muted-foreground">Loading...</p>}

      {promoCodes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No promo codes yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="py-2 font-medium">Code</th>
                <th className="py-2 font-medium">Discount</th>
                <th className="py-2 font-medium">Limit</th>
                <th className="py-2 font-medium">Applies to</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {promoCodes.map((promoCode) => (
                <tr key={promoCode.id} className="border-b border-card-border last:border-b-0">
                  <td className="py-2 font-mono text-foreground">{promoCode.code}</td>
                  <td className="py-2 text-foreground">{formatDiscount(promoCode)}</td>
                  <td className="py-2 text-muted-foreground">{formatLimit(promoCode)}</td>
                  <td className="py-2 text-muted-foreground">{promoCode.itemIds.map(itemLabel).join(", ")}</td>
                  <td className="py-2">
                    <span className={promoCode.enabled ? "text-foreground" : "text-muted-foreground"}>
                      {promoCode.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(promoCode)}
                      disabled={busyId === promoCode.id}
                      className={secondaryButtonClass}
                    >
                      {busyId === promoCode.id ? "Working..." : promoCode.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
