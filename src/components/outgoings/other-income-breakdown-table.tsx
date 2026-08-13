"use client";

import { useState, type FormEvent } from "react";
import { formatGBP, formatDate } from "@/lib/format";
import { OTHER_INCOME_CATEGORIES, RECURRING_INCOME_CATEGORIES, type GymName, type OtherIncomeCategory } from "@/lib/data/types";
import type { OtherIncomeCategoryAmount, OtherIncomeEntry } from "@/lib/data/other-income";

const inputClass =
  "w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none";
const buttonClass =
  "rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

interface OtherIncomeBreakdownTableProps {
  gym: GymName;
  categoryBreakdown: OtherIncomeCategoryAmount[];
  history: OtherIncomeEntry[];
  isAdmin: boolean;
  onSubmitted: () => void;
}

export function OtherIncomeBreakdownTable({
  gym,
  categoryBreakdown,
  history,
  isAdmin,
  onSubmitted,
}: OtherIncomeBreakdownTableProps) {
  const [category, setCategory] = useState<OtherIncomeCategory>(OTHER_INCOME_CATEGORIES[0]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const isRecurring = RECURRING_INCOME_CATEGORIES.has(category);

  async function handleDelete(id: number) {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    setDeletingId(id);
    try {
      const params = isAdmin ? `?gym=${encodeURIComponent(gym)}` : "";
      const res = await fetch(`/api/other-income/${id}${params}`, { method: "DELETE" });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not delete this entry.");
        return;
      }
      onSubmitted();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/other-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          amountGbp: Number(amount),
          effectiveFrom,
          ...(label.trim() ? { label: label.trim() } : {}),
          ...(isAdmin ? { gym } : {}),
        }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not save this entry.");
        return;
      }
      setAmount("");
      setEffectiveFrom("");
      setLabel("");
      onSubmitted();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card-glass p-5">
        <p className="text-sm font-semibold text-foreground">Current other income — {gym}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Category</th>
                <th className="py-2 text-right font-normal">Amount / month</th>
              </tr>
            </thead>
            <tbody>
              {categoryBreakdown.map((row) => (
                <tr key={row.category} className="border-b border-card-border last:border-0">
                  <td className="py-2 pr-3 text-foreground">{row.category}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{formatGBP(row.amountGbp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {history.length > 0 && (
          <>
            <p className="mt-6 text-sm font-semibold text-foreground">History</p>
            <div className="mt-2 max-h-48 overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">Category</th>
                    <th className="py-2 pr-3 font-normal">Label</th>
                    <th className="py-2 pr-3 text-right font-normal">Amount</th>
                    <th className="py-2 pr-3 text-right font-normal">Effective from</th>
                    <th className="py-2 pr-3 text-right font-normal">Entered</th>
                    <th className="py-2 text-right font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-b border-card-border last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{row.category}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{row.label ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {formatGBP(row.amountGbp)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {row.effectiveFrom}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          disabled={deletingId === row.id}
                          className="text-xs text-danger hover:underline disabled:opacity-50"
                        >
                          {deletingId === row.id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card-glass p-5">
        <p className="text-sm font-semibold text-foreground">Add / update an entry</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isRecurring
            ? "This category carries forward — the amount you enter takes effect from the month you choose onward until you change it, same as Outgoings."
            : "This category is a one-off — the amount only counts for the month you choose. Leave it un-entered in months with no such income."}
        </p>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="oi-category" className="mb-1 block text-xs text-muted-foreground">
              Category
            </label>
            <select
              id="oi-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as OtherIncomeCategory)}
              className={inputClass}
            >
              {OTHER_INCOME_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c} {RECURRING_INCOME_CATEGORIES.has(c) ? "(recurring)" : "(one-off)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="oi-label" className="mb-1 block text-xs text-muted-foreground">
              Label (optional)
            </label>
            <input
              id="oi-label"
              type="text"
              maxLength={200}
              placeholder="e.g. Xyz Corp contract"
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="oi-amount" className="mb-1 block text-xs text-muted-foreground">
              Amount (£{isRecurring ? " / month" : ""})
            </label>
            <input
              id="oi-amount"
              type="number"
              min="0"
              step="0.01"
              required
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="oi-effectiveFrom" className="mb-1 block text-xs text-muted-foreground">
              {isRecurring ? "Effective from" : "Month"}
            </label>
            <input
              id="oi-effectiveFrom"
              type="month"
              required
              className={inputClass}
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={submitting} className={buttonClass}>
            {submitting ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
