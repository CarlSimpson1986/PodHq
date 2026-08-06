"use client";

import { useState } from "react";
import { GYM_NAMES, type GymName } from "@/lib/data/types";
import type { DateRangePreset } from "@/lib/data/revenue";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "last_month", label: "Last month" },
  { value: "qtd", label: "Quarter to date" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "full_year", label: "Full year" },
];

const currentYear = new Date().getUTCFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const buttonBase = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
const buttonActive = "bg-accent text-accent-foreground";
const buttonInactive = "bg-card border border-card-border text-muted-foreground hover:text-foreground";
const linkButtonClass =
  "rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover";

export function ExportReportsCard() {
  const [gym, setGym] = useState<GymName>(GYM_NAMES[0]);
  const [preset, setPreset] = useState<DateRangePreset>("last_month");
  const [year, setYear] = useState(currentYear);

  const params = new URLSearchParams({ gym, preset });
  if (preset === "full_year") params.set("year", String(year));
  const href = `/api/admin/export/outgoings-pdf?${params.toString()}`;

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Export reports</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Download a gym&apos;s P&amp;L as a PDF — revenue, outgoings by category (with itemised transactions where
        available), ad spend and net — useful for sharing figures with a prospective franchisee without giving them
        a login.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <label htmlFor="export-gym" className="mb-1 block text-xs text-muted-foreground">
            Gym
          </label>
          <select
            id="export-gym"
            value={gym}
            onChange={(e) => setGym(e.target.value as GymName)}
            className="rounded-md border border-card-border bg-background px-2 py-2 text-sm text-foreground"
          >
            {GYM_NAMES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPreset(p.value)}
              className={`${buttonBase} ${preset === p.value ? buttonActive : buttonInactive}`}
            >
              {p.label}
            </button>
          ))}

          {preset === "full_year" && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <a href={href} download className={`${linkButtonClass} ml-auto`}>
            Download PDF
          </a>
        </div>
      </div>
    </div>
  );
}
