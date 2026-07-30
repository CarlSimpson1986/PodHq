"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GYM_NAMES, type GymName } from "@/lib/data/types";

const OPTIONS: (GymName | null)[] = [null, ...GYM_NAMES];

interface GymSelectProps {
  value: GymName | null;
  onChange: (gym: GymName | null) => void;
  disabled?: boolean;
  className?: string;
}

// Custom listbox replacing the native <select> for the gym filter: a native
// select's open popup is OS-rendered chrome that CSS can't restyle (its
// selection highlight stays Windows' default blue no matter what accent-color
// or option { background } is set to), which doesn't match the rest of the
// app's dark/gold treatment. This gives full control — gold highlight, black
// panel — while keeping listbox/option ARIA semantics and keyboard nav.
export function GymSelect({ value, onChange, disabled, className = "" }: GymSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function openAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function commit(index: number) {
    onChange(OPTIONS[index]);
    setOpen(false);
  }

  function onButtonKeyDown(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt(Math.max(0, OPTIONS.indexOf(value)));
    }
  }

  function onListKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(OPTIONS.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt(Math.max(0, OPTIONS.indexOf(value))))}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
      >
        <span>{value ?? "All gyms"}</span>
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
        <ul
          role="listbox"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute right-0 z-20 mt-1 max-h-72 w-48 overflow-y-auto rounded-md border border-card-border bg-card py-1 text-sm shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)] focus:outline-none"
          ref={(el) => el?.focus()}
        >
          {OPTIONS.map((opt, i) => {
            const selected = opt === value;
            const active = i === activeIndex;
            return (
              <li
                key={opt ?? "all"}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
                className={`cursor-pointer px-3 py-1.5 transition-colors ${
                  active ? "bg-accent text-accent-foreground" : selected ? "text-accent" : "text-foreground"
                }`}
              >
                {opt ?? "All gyms"}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
