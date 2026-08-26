"use client";

import { useState } from "react";
import type { FaqItem } from "@/lib/data/help-faq";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const dangerButtonClass =
  "rounded-md border border-danger/40 bg-card px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50";
const inputClass = "w-full rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

interface FormState {
  question: string;
  answer: string;
  displayOrder: string;
}

const emptyForm: FormState = { question: "", answer: "", displayOrder: "0" };

// Admin-only FAQ manager — one answer here changes what podhq-client's POD
// help chat tells every gym's members, not a per-gym decision (see
// chat-questions-shell.tsx, this only renders for role === "admin").
export function HelpFaqView({ initialItems }: { initialItems: FaqItem[] }) {
  const [items, setItems] = useState<FaqItem[]>(initialItems);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function reload() {
    const res = await fetch("/api/help-faq");
    const body = await res.json();
    if (body.status === "ok") setItems(body.items);
  }

  function startEdit(item: FaqItem) {
    setEditingId(item.id);
    setAdding(false);
    setForm({ question: item.question, answer: item.answer, displayOrder: String(item.displayOrder) });
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleCreate() {
    const displayOrder = Number(form.displayOrder) || 0;
    if (!form.question.trim() || !form.answer.trim()) {
      setError("A question and an answer are both required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/help-faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: form.question.trim(), answer: form.answer.trim(), displayOrder }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not create this FAQ item.");
        return;
      }
      cancelForm();
      reload();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: number) {
    const displayOrder = Number(form.displayOrder) || 0;
    if (!form.question.trim() || !form.answer.trim()) {
      setError("A question and an answer are both required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/help-faq/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: form.question.trim(), answer: form.answer.trim(), displayOrder }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not update this FAQ item.");
        return;
      }
      cancelForm();
      reload();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/help-faq/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not delete this FAQ item.");
        return;
      }
      reload();
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
          <h2 className="text-sm font-semibold text-foreground">Help FAQ</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What the POD chat answers from directly — live for every gym&apos;s members as soon as you save.
          </p>
        </div>
        {!adding && editingId === null && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setForm(emptyForm);
            }}
            className={buttonClass}
          >
            Add new
          </button>
        )}
      </div>

      {(adding || editingId !== null) && (
        <div className="mt-3 space-y-2 rounded-md border border-card-border p-3">
          <input
            placeholder="Question"
            value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            className={inputClass}
          />
          <textarea
            placeholder="Answer"
            value={form.answer}
            onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
            rows={3}
            className={inputClass}
          />
          <input
            placeholder="Display order (lower shows first)"
            type="number"
            value={form.displayOrder}
            onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
            className={`${inputClass} w-56`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (editingId !== null ? handleUpdate(editingId) : handleCreate())}
              disabled={saving}
              className={buttonClass}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={cancelForm} className={secondaryButtonClass}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No FAQ items yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-card-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.question}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.answer}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => startEdit(item)} className={secondaryButtonClass}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(item.id)} disabled={busyId === item.id} className={dangerButtonClass}>
                    {busyId === item.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
