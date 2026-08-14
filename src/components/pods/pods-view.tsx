"use client";

import { useState } from "react";
import Link from "next/link";
import { GymSelect } from "@/components/ui/gym-select";
import type { GymName } from "@/lib/data/types";
import type { PodBooking, PodMember, PodSettings } from "@/lib/data/pods";

const inputClass = "rounded-md border border-card-border bg-background px-2 py-1.5 text-sm text-foreground";
const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-4 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50";

function formatTime(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatSlot(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABELS: Record<PodBooking["status"], string> = {
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export function PodsView({
  role,
  initialGym,
  initialDate,
  initialSettings,
  initialBookings,
  initialMembers,
}: {
  role: "admin" | "owner";
  initialGym: GymName;
  initialDate: string;
  initialSettings: PodSettings | null;
  initialBookings: PodBooking[];
  initialMembers: PodMember[];
}) {
  const [gym, setGym] = useState<GymName>(initialGym);
  const [date, setDate] = useState(initialDate);
  const [settings, setSettings] = useState(initialSettings);
  const [bookings, setBookings] = useState(initialBookings);
  const [members, setMembers] = useState(initialMembers);
  const [loading, setLoading] = useState(false);

  const [selectedMemberId, setSelectedMemberId] = useState<number | "">("");
  const [selectedHour, setSelectedHour] = useState(9);
  const [bookError, setBookError] = useState<string | null>(null);
  const [bookSuccess, setBookSuccess] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const [capacityDraft, setCapacityDraft] = useState(initialSettings?.podCapacity ?? 1);
  const [openHourDraft, setOpenHourDraft] = useState(initialSettings?.openHour ?? 0);
  const [closeHourDraft, setCloseHourDraft] = useState(initialSettings?.closeHour ?? 24);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  async function refetch(nextGym: GymName, nextDate: string) {
    setLoading(true);
    try {
      const [settingsRes, bookingsRes, membersRes] = await Promise.all([
        fetch(`/api/pods/settings?gym=${encodeURIComponent(nextGym)}`),
        fetch(`/api/pods/bookings?gym=${encodeURIComponent(nextGym)}&date=${nextDate}`),
        fetch(`/api/pods/members?gym=${encodeURIComponent(nextGym)}`),
      ]);
      const settingsBody = await settingsRes.json();
      const bookingsBody = await bookingsRes.json();
      const membersBody = await membersRes.json();

      const nextSettings: PodSettings | null = settingsBody.status === "ok" ? settingsBody.settings : null;
      setSettings(nextSettings);
      setCapacityDraft(nextSettings?.podCapacity ?? 1);
      setOpenHourDraft(nextSettings?.openHour ?? 0);
      setCloseHourDraft(nextSettings?.closeHour ?? 24);
      setBookings(bookingsBody.status === "ok" ? bookingsBody.bookings : []);
      setMembers(membersBody.status === "ok" ? membersBody.members : []);
    } finally {
      setLoading(false);
    }
  }

  function handleGymChange(next: GymName | null) {
    if (!next || role !== "admin") return;
    setGym(next);
    setBookError(null);
    setBookSuccess(null);
    refetch(next, date);
  }

  function handleDateChange(next: string) {
    setDate(next);
    setBookError(null);
    setBookSuccess(null);
    refetch(gym, next);
  }

  async function handleBook() {
    if (!selectedMemberId) {
      setBookError("Select a member.");
      return;
    }
    setBookError(null);
    setBookSuccess(null);
    setBooking(true);
    try {
      const slotStart = new Date(`${date}T00:00:00`);
      slotStart.setHours(selectedHour, 0, 0, 0);

      const res = await fetch("/api/pods/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, memberId: selectedMemberId, slotStart: slotStart.toISOString() }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setBookError(body.message ?? "Could not create booking.");
        return;
      }
      setBookSuccess(`Booked ${formatTime(selectedHour)}.`);
      await refetch(gym, date);
    } catch {
      setBookError("Something went wrong. Try again.");
    } finally {
      setBooking(false);
    }
  }

  async function handleSaveSettings() {
    setSettingsError(null);
    setSettingsSuccess(false);
    setSavingSettings(true);
    try {
      const res = await fetch("/api/pods/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, podCapacity: capacityDraft, openHour: openHourDraft, closeHour: closeHourDraft }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setSettingsError(body.message ?? "Could not save settings.");
        return;
      }
      setSettings({ gym, podCapacity: capacityDraft, openHour: openHourDraft, closeHour: closeHourDraft });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch {
      setSettingsError("Something went wrong. Try again.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">Pods</h1>
          <Link href="/pods/transactions" className="text-xs text-accent hover:underline">
            Transactions & refunds
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {role === "admin" ? (
            <GymSelect value={gym} onChange={handleGymChange} className="w-56" />
          ) : (
            <span className="text-sm text-muted-foreground">{gym}</span>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!settings ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          This gym has no pod configured yet.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-card-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Pod settings</h2>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Capacity per slot
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={capacityDraft}
                  onChange={(e) => setCapacityDraft(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Open hour
                <select
                  value={openHourDraft}
                  onChange={(e) => setOpenHourDraft(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {formatTime(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Close hour
                <select
                  value={closeHourDraft}
                  onChange={(e) => setCloseHourDraft(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                >
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                    <option key={h} value={h}>
                      {h === 24 ? "24:00" : formatTime(h)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={handleSaveSettings} disabled={savingSettings} className={buttonClass}>
                {savingSettings ? "Saving..." : "Save"}
              </button>
              {settingsSuccess && <span className="text-xs text-success">Saved.</span>}
            </div>
            {settingsError && <p className="mt-2 text-xs text-danger">{settingsError}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              Self-service members can only book between {formatTime(settings.openHour)} and{" "}
              {settings.closeHour === 24 ? "24:00" : formatTime(settings.closeHour)}. Manual bookings below can go
              outside those hours; capacity ({settings.podCapacity} concurrent) always applies regardless of who books.
            </p>
          </section>

          <section className="rounded-lg border border-card-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Book a member manually</h2>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Member
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value ? Number(e.target.value) : "")}
                  className={`${inputClass} w-56`}
                >
                  <option value="">Select a member...</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Time
                <select
                  value={selectedHour}
                  onChange={(e) => setSelectedHour(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {formatTime(h)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={handleBook} disabled={booking} className={buttonClass}>
                {booking ? "Booking..." : "Book"}
              </button>
            </div>
            {members.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">No members registered for this gym yet.</p>
            )}
            {bookError && <p className="mt-2 text-xs text-danger">{bookError}</p>}
            {bookSuccess && <p className="mt-2 text-xs text-success">{bookSuccess}</p>}
          </section>

          <section className="rounded-lg border border-card-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Bookings for {date}</h2>
            {bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings for this date.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-card-border text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Time</th>
                    <th className="py-2 font-medium">Member</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-b border-card-border last:border-b-0">
                      <td className="py-2 tabular-nums text-foreground">{formatSlot(b.slotStart)}</td>
                      <td className="py-2 text-foreground">{b.memberName}</td>
                      <td className="py-2 text-muted-foreground">{STATUS_LABELS[b.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
