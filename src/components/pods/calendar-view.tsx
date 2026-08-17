"use client";

import { useEffect, useState } from "react";
import { GymSelect } from "@/components/ui/gym-select";
import type { GymName } from "@/lib/data/types";
import type { PodBooking, PodMember, PodResource, SlotDetail, WaitlistCount } from "@/lib/data/pods";

type ViewMode = "day" | "week" | "month";

const inputClass = "rounded-md border border-card-border bg-background px-2 py-1.5 text-sm text-foreground";
const buttonClass =
  "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50";
const dangerButtonClass =
  "rounded-md border border-danger/50 px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50";
const ghostButtonClass = "rounded-md border border-card-border px-2 py-1 text-xs text-muted-foreground";
const tabActiveClass = "rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-medium text-accent-foreground";
const tabInactiveClass = "rounded-md border border-card-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground";

function toDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** Monday of the week containing d. */
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function formatHour(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

export function CalendarView({
  role,
  initialGym,
  initialResources,
  initialMembers,
}: {
  role: "admin" | "owner";
  initialGym: GymName;
  initialResources: PodResource[];
  initialMembers: PodMember[];
}) {
  const [gym, setGym] = useState<GymName>(initialGym);
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [resources, setResources] = useState<PodResource[]>(initialResources);
  const [resourceId, setResourceId] = useState<number | null>(initialResources[0]?.id ?? null);
  const [members, setMembers] = useState(initialMembers);
  const [bookings, setBookings] = useState<PodBooking[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistCount[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);

  const [editingSettings, setEditingSettings] = useState(false);
  const resource = resources.find((r) => r.id === resourceId) ?? null;
  const [capacityDraft, setCapacityDraft] = useState(resource?.podCapacity ?? 1);
  const [openHourDraft, setOpenHourDraft] = useState(resource?.openHour ?? 0);
  const [closeHourDraft, setCloseHourDraft] = useState(resource?.closeHour ?? 24);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Reset the settings-edit drafts whenever the selected resource changes
  // (switching tabs, or a fresh fetch after a gym change) — React's own
  // "adjusting state when a prop changes" pattern (setState during render,
  // guarded by comparing against the previous value), not a useEffect:
  // this only needs to run before the next paint, and a plain effect here
  // would be flagged as an unnecessary cascading-render risk by this
  // project's lint config (see podhq-client's identical fix earlier the
  // same session).
  const [lastResourceId, setLastResourceId] = useState(resourceId);
  if (resourceId !== lastResourceId) {
    setLastResourceId(resourceId);
    setCapacityDraft(resource?.podCapacity ?? 1);
    setOpenHourDraft(resource?.openHour ?? 0);
    setCloseHourDraft(resource?.closeHour ?? 24);
  }

  // Range covered by the current view.
  const rangeStart = view === "day" ? anchor : view === "week" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));
  const rangeDays = view === "day" ? 1 : view === "week" ? 7 : Math.ceil((addDays(startOfMonth(addDays(anchor, 32)), -1).getDate() + startOfMonth(anchor).getDay() + 6) / 7) * 7;
  const rangeEndExclusive = addDays(rangeStart, rangeDays);

  async function fetchRange(nextGym: GymName, start: Date, endExclusive: Date) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/pods/calendar?gym=${encodeURIComponent(nextGym)}&start=${toDateParam(start)}&end=${toDateParam(endExclusive)}`
      );
      const body = await res.json();
      setBookings(body.status === "ok" ? body.bookings : []);
      setWaitlist(body.status === "ok" ? body.waitlist : []);
    } finally {
      setLoading(false);
    }
  }

  async function fetchResourcesAndMembers(nextGym: GymName) {
    const [resourcesRes, membersRes] = await Promise.all([
      fetch(`/api/pods/resources?gym=${encodeURIComponent(nextGym)}`),
      fetch(`/api/pods/members?gym=${encodeURIComponent(nextGym)}`),
    ]);
    const resourcesBody = await resourcesRes.json();
    const membersBody = await membersRes.json();
    const nextResources: PodResource[] = resourcesBody.status === "ok" ? resourcesBody.resources : [];
    setResources(nextResources);
    setResourceId(nextResources[0]?.id ?? null);
    setMembers(membersBody.status === "ok" ? membersBody.members : []);
  }

  useEffect(() => {
    // Deferred a tick so the fetch's own setLoading/setBookings calls
    // aren't reachable synchronously from the effect body itself.
    queueMicrotask(() => fetchRange(gym, rangeStart, rangeEndExclusive));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gym, view, anchor.getTime()]);

  function handleGymChange(next: GymName | null) {
    if (!next || role !== "admin") return;
    setGym(next);
    fetchResourcesAndMembers(next);
  }

  function step(direction: -1 | 1) {
    if (view === "day") setAnchor((d) => addDays(d, direction));
    else if (view === "week") setAnchor((d) => addDays(d, direction * 7));
    else setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + direction, 1));
  }

  function goToday() {
    setAnchor(new Date());
  }

  async function handleSaveSettings() {
    if (!resourceId) return;
    setSettingsError(null);
    setSavingSettings(true);
    try {
      const res = await fetch("/api/pods/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, resourceId, podCapacity: capacityDraft, openHour: openHourDraft, closeHour: closeHourDraft }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setSettingsError(body.message ?? "Could not save settings.");
        return;
      }
      setResources((prev) =>
        prev.map((r) => (r.id === resourceId ? { ...r, podCapacity: capacityDraft, openHour: openHourDraft, closeHour: closeHourDraft } : r))
      );
      setEditingSettings(false);
    } catch {
      setSettingsError("Something went wrong. Try again.");
    } finally {
      setSavingSettings(false);
    }
  }

  function countAt(date: Date, hour: number): number {
    return bookings.filter((b) => {
      if (b.resourceId !== resourceId) return false;
      const bd = new Date(b.slotStart);
      return isSameDay(bd, date) && bd.getHours() === hour;
    }).length;
  }

  function countForDay(date: Date): number {
    return bookings.filter((b) => b.resourceId === resourceId && isSameDay(new Date(b.slotStart), date)).length;
  }

  function waitlistCountAt(date: Date, hour: number): number {
    return waitlist
      .filter((w) => {
        if (w.resourceId !== resourceId) return false;
        const wd = new Date(w.slotStart);
        return isSameDay(wd, date) && wd.getHours() === hour;
      })
      .reduce((sum, w) => sum + w.count, 0);
  }

  const capacity = resource?.podCapacity ?? 1;

  function headerLabel() {
    if (view === "day") return anchor.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (view === "week") {
      const end = addDays(rangeStart, 6);
      return `${rangeStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    return anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }

  const dayColumns = view === "day" ? [anchor] : view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)) : [];
  const monthWeeks =
    view === "month"
      ? Array.from({ length: rangeDays / 7 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(rangeStart, w * 7 + d)))
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
          <p className="text-xs text-muted-foreground">{headerLabel()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => step(-1)} className={ghostButtonClass} aria-label="Previous">
            &larr;
          </button>
          <button type="button" onClick={goToday} className={ghostButtonClass}>
            Today
          </button>
          <button type="button" onClick={() => step(1)} className={ghostButtonClass} aria-label="Next">
            &rarr;
          </button>
          <select value={view} onChange={(e) => setView(e.target.value as ViewMode)} className={inputClass}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
          {role === "admin" ? (
            <GymSelect value={gym} onChange={handleGymChange} className="w-56" />
          ) : (
            <span className="text-sm text-muted-foreground">{gym}</span>
          )}
          <button type="button" onClick={() => setEditingSettings((v) => !v)} className={ghostButtonClass}>
            Edit settings
          </button>
        </div>
      </div>

      {/* Resource tabs — a gym with exactly one resource shows nothing
          here at all, no behavior change from before this feature. */}
      {resources.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {resources.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setResourceId(r.id)}
              className={r.id === resourceId ? tabActiveClass : tabInactiveClass}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {editingSettings && (
        <section className="card-glass p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {resource ? `${resource.label} settings` : "Pod settings"}
          </h2>
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
              <select value={openHourDraft} onChange={(e) => setOpenHourDraft(Number(e.target.value))} className={`${inputClass} w-24`}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Close hour
              <select value={closeHourDraft} onChange={(e) => setCloseHourDraft(Number(e.target.value))} className={`${inputClass} w-24`}>
                {HOURS.map((h) => h + 1).map((h) => (
                  <option key={h} value={h}>
                    {h === 24 ? "24:00" : formatHour(h)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={handleSaveSettings} disabled={savingSettings || !resourceId} className={buttonClass}>
              {savingSettings ? "Saving..." : "Save"}
            </button>
          </div>
          {settingsError && <p className="mt-2 text-xs text-danger">{settingsError}</p>}
          {!resource && <p className="mt-2 text-xs text-warning">This gym has no pod configured yet.</p>}
        </section>
      )}

      {loading && <p className="text-xs text-muted-foreground">Loading...</p>}

      {view === "month" ? (
        <section className="overflow-x-auto card-glass p-4">
          {/* A real <table> with border-collapse, not a CSS-grid-gap fake —
              the gap trick doesn't guarantee gridlines cross cleanly at
              intersections (subpixel rounding on fractional column widths
              breaks it, invisible on the old thin light-gray border but
              obvious on the thicker near-black one). border-collapse is
              what browsers actually use to solve this. */}
          <table className="w-full min-w-[560px] table-fixed border-collapse text-xs">
            <thead>
              <tr>
                {DAY_LABELS.map((label) => (
                  <th key={label} className="border border-card-border bg-card p-2 text-center font-medium text-muted-foreground">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthWeeks.map((week, weekIdx) => (
                <tr key={weekIdx}>
                  {week.map((day) => {
                    const inMonth = day.getMonth() === anchor.getMonth();
                    const count = countForDay(day);
                    return (
                      <td key={day.toISOString()} className="border border-card-border p-0">
                        <button
                          type="button"
                          onClick={() => {
                            setAnchor(day);
                            setView("day");
                          }}
                          className={`flex h-16 w-full flex-col items-start p-1.5 text-left transition-colors hover:bg-card-border/10 ${
                            inMonth ? "text-foreground" : "text-muted-foreground/50"
                          }`}
                        >
                          <span className="tabular-nums">{day.getDate()}</span>
                          {count > 0 && <span className="text-accent">{count} booked</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="overflow-x-auto card-glass p-4">
          <table className="w-full table-fixed border-collapse text-xs">
            <colgroup>
              <col style={{ width: 56 }} />
              {dayColumns.map((day) => (
                <col key={day.toISOString()} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="border border-card-border bg-card" />
                {dayColumns.map((day) => (
                  <th key={day.toISOString()} className="border border-card-border bg-card p-2 text-center font-medium text-foreground">
                    {day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hour) => (
                <tr key={hour}>
                  <td className="border border-card-border bg-card p-1.5 text-right text-muted-foreground">{formatHour(hour)}</td>
                  {dayColumns.map((day) => {
                    const count = countAt(day, hour);
                    const full = count >= capacity;
                    const waiting = waitlistCountAt(day, hour);
                    return (
                      <td key={`${day.toISOString()}-${hour}`} className="border border-card-border p-0">
                        <button
                          type="button"
                          disabled={!resourceId}
                          onClick={() => setSelectedSlot(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour))}
                          className={`flex h-20 w-full flex-col items-center justify-center gap-0.5 transition-colors disabled:opacity-50 ${
                            full
                              ? "bg-danger text-white hover:bg-danger/90"
                              : count > 0
                                ? "bg-warning/10 text-warning hover:bg-warning/15"
                                : "text-muted-foreground hover:bg-card-border/10"
                          }`}
                        >
                          <span className="tabular-nums text-sm font-medium">
                            {count}/{capacity}
                          </span>
                          {waiting > 0 && (
                            <span className={`tabular-nums text-[11px] ${full ? "text-white/80" : "text-muted-foreground"}`}>
                              {waiting} waiting
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selectedSlot && resourceId && (
        <SlotPanel
          gym={gym}
          resourceId={resourceId}
          resourceLabel={resource?.label ?? ""}
          slot={selectedSlot}
          members={members}
          onClose={() => setSelectedSlot(null)}
          onChanged={() => fetchRange(gym, rangeStart, rangeEndExclusive)}
        />
      )}
    </div>
  );
}

function SlotPanel({
  gym,
  resourceId,
  resourceLabel,
  slot,
  members,
  onClose,
  onChanged,
}: {
  gym: GymName;
  resourceId: number;
  resourceLabel: string;
  slot: Date;
  members: PodMember[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SlotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState<number | "">("");
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/pods/slot?gym=${encodeURIComponent(gym)}&resourceId=${resourceId}&slotStart=${encodeURIComponent(slot.toISOString())}`
      );
      const body = await res.json();
      setDetail(body.status === "ok" ? body.detail : { bookings: [], waitlist: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.getTime(), resourceId]);

  async function handleBook() {
    if (!selectedMemberId) {
      setBookError("Select a member.");
      return;
    }
    setBookError(null);
    setBooking(true);
    try {
      const res = await fetch("/api/pods/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, resourceId, memberId: selectedMemberId, slotStart: slot.toISOString() }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setBookError(body.message ?? "Could not create booking.");
        return;
      }
      setSelectedMemberId("");
      await load();
      onChanged();
    } catch {
      setBookError("Something went wrong. Try again.");
    } finally {
      setBooking(false);
    }
  }

  async function handleCancel(bookingId: number) {
    setCancellingId(bookingId);
    try {
      const res = await fetch("/api/pods/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gym, bookingId }),
      });
      const body = await res.json();
      if (body.status === "ok") {
        setConfirmingCancelId(null);
        await load();
        onChanged();
      }
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto card-glass p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {slot.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatHour(slot.getHours())} &middot; {resourceLabel || gym}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            &times;
          </button>
        </div>

        {loading || !detail ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value ? Number(e.target.value) : "")}
                className={`${inputClass} flex-1`}
              >
                <option value="">Search to add a member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleBook} disabled={booking} className={buttonClass}>
                {booking ? "Booking..." : "Book"}
              </button>
            </div>
            {bookError && <p className="mb-3 text-xs text-danger">{bookError}</p>}

            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
              Booked ({detail.bookings.filter((b) => b.status === "booked").length})
            </h3>
            {detail.bookings.length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">No one booked yet.</p>
            ) : (
              <ul className="mb-4 space-y-1">
                {detail.bookings.map((b) => (
                  <li key={b.bookingId} className="flex items-center justify-between rounded-md border border-card-border px-2 py-1.5 text-sm">
                    <span className="text-foreground">{b.memberName}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground capitalize">{b.status.replace("_", "-")}</span>
                      {b.status === "booked" &&
                        (confirmingCancelId === b.bookingId ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCancel(b.bookingId)}
                              disabled={cancellingId === b.bookingId}
                              className={dangerButtonClass}
                            >
                              {cancellingId === b.bookingId ? "..." : "Confirm"}
                            </button>
                            <button type="button" onClick={() => setConfirmingCancelId(null)} className={ghostButtonClass}>
                              Back
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setConfirmingCancelId(b.bookingId)} className={dangerButtonClass}>
                            Cancel
                          </button>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Waiting ({detail.waitlist.length})</h3>
            {detail.waitlist.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one waiting.</p>
            ) : (
              <ul className="space-y-1">
                {detail.waitlist.map((w) => (
                  <li key={w.memberId} className="rounded-md border border-card-border px-2 py-1.5 text-sm text-foreground">
                    {w.memberName}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
