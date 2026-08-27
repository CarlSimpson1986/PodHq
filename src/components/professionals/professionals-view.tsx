"use client";

import { useState } from "react";
import type { Professional, ProfessionalInquiry } from "@/lib/data/professionals";
import { GYM_NAMES } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const dangerButtonClass =
  "rounded-md border border-danger/40 bg-card px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50";
const inputClass = "w-full rounded-md border border-card-border bg-card px-2 py-1 text-sm text-foreground";

interface FormState {
  name: string;
  photoUrl: string;
  bio: string;
  qualifications: string;
  specialties: string;
  gyms: string[];
  pricePerHourGbp: string;
  active: boolean;
  displayOrder: string;
}

const emptyForm: FormState = {
  name: "",
  photoUrl: "",
  bio: "",
  qualifications: "",
  specialties: "",
  gyms: [],
  pricePerHourGbp: "",
  active: true,
  displayOrder: "0",
};

function toFormState(item: Professional): FormState {
  return {
    name: item.name,
    photoUrl: item.photoUrl ?? "",
    bio: item.bio,
    qualifications: item.qualifications,
    specialties: item.specialties.join(", "),
    gyms: item.gyms,
    pricePerHourGbp: String(item.pricePerHourGbp),
    active: item.active,
    displayOrder: String(item.displayOrder),
  };
}

// Admin-only PT directory manager, same list+inline-form shape as
// help-faq-view.tsx. Placeholder profiles until Carl recruits real
// trainers (2026-08-27) — no photo upload exists anywhere in either app
// yet, so photoUrl is just a pasted-in hosted URL for now.
export function ProfessionalsView({
  initialItems,
  initialInquiries,
}: {
  initialItems: Professional[];
  initialInquiries: ProfessionalInquiry[];
}) {
  const [items, setItems] = useState<Professional[]>(initialItems);
  const [inquiries] = useState<ProfessionalInquiry[]>(initialInquiries);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function reload() {
    const res = await fetch("/api/professionals");
    const body = await res.json();
    if (body.status === "ok") setItems(body.items);
  }

  function startEdit(item: Professional) {
    setEditingId(item.id);
    setAdding(false);
    setForm(toFormState(item));
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  function toggleGym(gym: string) {
    setForm((f) => ({ ...f, gyms: f.gyms.includes(gym) ? f.gyms.filter((g) => g !== gym) : [...f.gyms, gym] }));
  }

  function buildPayload() {
    const pricePerHourGbp = Number(form.pricePerHourGbp);
    const displayOrder = Number(form.displayOrder) || 0;
    return {
      name: form.name.trim(),
      photoUrl: form.photoUrl.trim(),
      bio: form.bio.trim(),
      qualifications: form.qualifications.trim(),
      specialties: form.specialties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      gyms: form.gyms,
      pricePerHourGbp,
      active: form.active,
      displayOrder,
    };
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.pricePerHourGbp.trim()) {
      setError("A name and a price per hour are both required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/professionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not create this professional.");
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
    if (!form.name.trim() || !form.pricePerHourGbp.trim()) {
      setError("A name and a price per hour are both required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/professionals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not update this professional.");
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
      const res = await fetch(`/api/professionals/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not delete this professional.");
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
    <div className="space-y-6">
      <section className="card-glass p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Find a Professional — directory</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Trainer profiles shown in podhq-client&apos;s member-facing directory. Inactive profiles stay hidden from members without deleting them.
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
            <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
            <input
              placeholder="Photo URL (optional — leave blank for an initials avatar)"
              value={form.photoUrl}
              onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))}
              className={inputClass}
            />
            <textarea
              placeholder="Bio"
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={3}
              className={inputClass}
            />
            <input
              placeholder="Qualifications (e.g. Level 3 PT, BSc Exercise Science)"
              value={form.qualifications}
              onChange={(e) => setForm((f) => ({ ...f, qualifications: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder="Specialties, comma separated (e.g. Strength, Flexibility, Boxing)"
              value={form.specialties}
              onChange={(e) => setForm((f) => ({ ...f, specialties: e.target.value }))}
              className={inputClass}
            />
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Gyms</p>
              <div className="flex flex-wrap gap-1.5">
                {GYM_NAMES.map((gym) => (
                  <button
                    key={gym}
                    type="button"
                    onClick={() => toggleGym(gym)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      form.gyms.includes(gym) ? "border-accent bg-accent/15 text-accent" : "border-card-border text-muted-foreground"
                    }`}
                  >
                    {gym}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Price per hour (GBP)"
                type="number"
                value={form.pricePerHourGbp}
                onChange={(e) => setForm((f) => ({ ...f, pricePerHourGbp: e.target.value }))}
                className={`${inputClass} w-40`}
              />
              <input
                placeholder="Display order"
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                className={`${inputClass} w-40`}
              />
              <label className="flex items-center gap-1.5 text-xs text-foreground">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Active (visible to members)
              </label>
            </div>
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
          <p className="mt-3 text-sm text-muted-foreground">No professionals yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border border-card-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.name} {!item.active && <span className="text-muted-foreground">(hidden)</span>}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      £{item.pricePerHourGbp.toFixed(2)}/hr · {item.specialties.join(", ") || "No specialties set"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.gyms.join(", ") || "No gyms set"}</p>
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

      <section className="card-glass p-4">
        <h2 className="text-sm font-semibold text-foreground">Recent inquiries</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Members asking to be put in touch — reach out to them directly to arrange it.
        </p>
        {inquiries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No inquiries yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {inquiries.map((inquiry) => (
              <li key={inquiry.id} className="rounded-md border border-card-border p-3">
                <p className="text-sm font-medium text-foreground">
                  {inquiry.memberName} → {inquiry.professionalName}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{inquiry.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(inquiry.createdAt).toLocaleString("en-GB")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
