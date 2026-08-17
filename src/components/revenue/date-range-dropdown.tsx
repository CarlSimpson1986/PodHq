"use client";

import { useEffect, useRef, useState } from "react";
import type { DateRangePreset, MonthRange } from "@/lib/data/revenue";
import { formatMonthLabel } from "@/lib/format";

// Same custom-dropdown pattern as GymSelect (src/components/ui/gym-select.tsx)
// — click-outside-to-close via a mousedown listener, absolute-positioned
// panel, same border/shadow treatment — for visual consistency across this
// page's two filter controls.
const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "last_month", label: "Last month" },
  { value: "qtd", label: "Quarter to date" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "full_year", label: "Full year" },
];

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatRange(range: MonthRange): string {
  return range.start === range.end
    ? formatMonthLabel(range.start)
    : `${formatMonthLabel(range.start)} – ${formatMonthLabel(range.end)}`;
}

interface DateRangeDropdownProps {
  preset: DateRangePreset;
  month: string;
  range: MonthRange;
  lastCompletedMonth: string;
  disabled?: boolean;
  onPreset: (preset: DateRangePreset) => void;
  onSelectYear: (year: number) => void;
  onMonth: (month: string) => void;
}

export function DateRangeDropdown({
  preset,
  month,
  range,
  lastCompletedMonth,
  disabled,
  onPreset,
  onSelectYear,
  onMonth,
}: DateRangeDropdownProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => Number(month.slice(0, 4)));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const maxYear = Number(lastCompletedMonth.slice(0, 4));
  const maxMonthNum = Number(lastCompletedMonth.slice(5, 7));

  function selectPreset(p: DateRangePreset) {
    onPreset(p);
    if (p !== "full_year") setOpen(false);
  }

  function selectMonth(monthStr: string) {
    onMonth(monthStr);
    setOpen(false);
  }

  // The year heading doubles as "pick this whole year" — avoids a second,
  // redundant year <select> alongside the month grid for the same panel.
  // A single combined callback, not onPreset+onYear called separately —
  // two sequential prop calls would each trigger the parent's own refetch
  // off a stale closure (setPreset hasn't re-rendered yet when the second
  // call reads `preset`), fetching the wrong preset/year combination.
  function selectYear() {
    onSelectYear(viewYear);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md border border-card-border bg-card px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="4" width="14" height="13" rx="1.5" />
          <path d="M3 8h14M7 2.5v3M13 2.5v3" strokeLinecap="round" />
        </svg>
        <span>{formatRange(range)}</span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 flex w-[380px] gap-3 rounded-md border border-card-border bg-card p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]">
          <ul className="w-32 shrink-0 space-y-0.5 border-r border-card-border pr-3">
            {PRESETS.map((p) => (
              <li key={p.value}>
                <button
                  type="button"
                  onClick={() => selectPreset(p.value)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                    preset === p.value ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-card-border"
                  }`}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewYear((y) => y - 1)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Previous year"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={selectYear}
                className="rounded px-2 py-0.5 text-sm font-semibold text-foreground hover:bg-card-border"
              >
                {viewYear}
              </button>
              <button
                type="button"
                disabled={viewYear >= maxYear}
                onClick={() => setViewYear((y) => y + 1)}
                className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Next year"
              >
                ›
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {MONTH_ABBR.map((label, i) => {
                const monthNum = i + 1;
                const monthStr = `${viewYear}-${String(monthNum).padStart(2, "0")}`;
                const isFuture = viewYear === maxYear ? monthNum > maxMonthNum : viewYear > maxYear;
                const isSelected = preset === "month" && monthStr === month;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={isFuture}
                    onClick={() => selectMonth(monthStr)}
                    className={`rounded px-2 py-1.5 text-sm transition-colors disabled:opacity-30 ${
                      isSelected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-card-border"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
