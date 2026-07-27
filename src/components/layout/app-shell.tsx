"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="3" width="6" height="8" rx="1" />
        <rect x="11" y="3" width="6" height="5" rx="1" />
        <rect x="11" y="10" width="6" height="7" rx="1" />
        <rect x="3" y="13" width="6" height="4" rx="1" />
      </svg>
    ),
  },
  {
    href: "/revenue",
    label: "Revenue",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M3 15 7 9l3 3 5-6 2 2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 17h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/members",
    label: "Members",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="7" cy="6.5" r="2.5" />
        <path d="M2.5 16c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2" strokeLinecap="round" />
        <circle cx="14.5" cy="7.5" r="2" />
        <path d="M12.7 12c1.9 0 3.3 1.4 3.3 3.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/outgoings",
    label: "Outgoings",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v8M7.5 8.2c0-1.2 1.1-2.2 2.5-2.2s2.5.8 2.5 1.9-1 1.6-2.5 1.9c-1.5.3-2.5.9-2.5 2s1.1 1.9 2.5 1.9 2.5-.8 2.5-1.9" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-card-border bg-card md:flex">
        <p className="px-5 py-6 text-sm font-semibold tracking-wide text-accent">PodHQ</p>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-5">
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile top bar (wordmark + sign out — nav itself is the bottom bar) */}
      <div className="flex items-center justify-between border-b border-card-border bg-card px-4 py-3 md:hidden">
        <p className="text-sm font-semibold tracking-wide text-accent">PodHQ</p>
        <SignOutButton />
      </div>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-card-border bg-card md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${
                active ? "text-accent" : "text-muted-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
