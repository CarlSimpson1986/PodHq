"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/layout/logo";

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
  {
    href: "/marketing",
    label: "Marketing",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M3 9v2a1 1 0 0 0 1 1h2l4 3V5L6 8H4a1 1 0 0 0-1 1Z" strokeLinejoin="round" />
        <path d="M13 7.5a3 3 0 0 1 0 5M15.5 5.5a6 6 0 0 1 0 9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/leads",
    label: "Leads",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="7" cy="6" r="2.5" />
        <path d="M2.5 16c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2" strokeLinecap="round" />
        <path d="M12 5.5h5.5M12 8.5h5.5M12 11.5h3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/pods",
    label: "Pods",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="7" width="14" height="9" rx="2" />
        <path d="M7 7V5.5a3 3 0 0 1 6 0V7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "Admin",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M10 2.5 4 5v4.5c0 4 2.6 6.6 6 8 3.4-1.4 6-4 6-8V5l-6-2.5Z" strokeLinejoin="round" />
        <path d="M7.5 10 9 11.5 12.5 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function AppShell({ children, role }: { children: ReactNode; role?: "admin" | "owner" }) {
  const pathname = usePathname();
  const navItems = role === "admin" ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/admin");

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-card-border bg-card md:flex">
        <div className="flex items-center gap-2 px-5 py-6">
          <Logo />
          <span className="text-xs font-medium tracking-wide text-muted-foreground">PodHQ</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-gradient-to-r from-accent to-accent-hover text-accent-foreground shadow-[0_0_24px_-6px_var(--accent)]"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
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
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-xs font-medium tracking-wide text-muted-foreground">PodHQ</span>
        </div>
        <SignOutButton />
      </div>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-card-border bg-card md:hidden">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
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
