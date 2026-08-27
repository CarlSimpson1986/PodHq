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
    href: "/pods/calendar",
    label: "Calendar",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <path d="M3 8h14M7 2.5v3M13 2.5v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/pods",
    label: "Access",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="7" width="14" height="9" rx="2" />
        <path d="M7 7V5.5a3 3 0 0 1 6 0V7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/chat-questions",
    label: "Chat Questions",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v6A1.5 1.5 0 0 1 15.5 13H9l-3.5 3v-3H4.5A1.5 1.5 0 0 1 3 11.5v-6Z" strokeLinejoin="round" />
        <path d="M8.6 7c.15-.85.95-1.4 1.8-1.4.95 0 1.75.6 1.75 1.45 0 .75-.5 1.05-1.05 1.4-.5.3-.85.6-.85 1.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10.25" cy="10.75" r="0.55" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/setup",
    label: "Setup",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 3v2M10 15v2M17 10h-2M5 10H3M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3 4.9 4.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/professionals",
    label: "Professionals",
    icon: (
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="6.5" cy="6.5" r="2.5" />
        <path d="M2.5 16c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2" strokeLinecap="round" />
        <circle cx="14.5" cy="7.5" r="2" />
        <path d="M12.7 12c1.9 0 3.3 1.4 3.3 3.6" strokeLinecap="round" />
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

const ADMIN_ONLY_HREFS = ["/admin", "/professionals"];

export function AppShell({ children, role }: { children: ReactNode; role?: "admin" | "owner" }) {
  const pathname = usePathname();
  const navItems = NAV_ITEMS.filter((item) => {
    if (ADMIN_ONLY_HREFS.includes(item.href)) return role === "admin";
    return true;
  });

  // Some hrefs are prefixes of others (e.g. /pods and /pods/calendar), so a
  // plain startsWith would highlight both at once — only the longest
  // matching href should ever be active. A member's own profile page
  // (/pods/members/[id]) is reachable from both Access and Calendar, so it
  // deliberately highlights neither rather than picking one arbitrarily.
  const activeHref = pathname?.startsWith("/pods/members")
    ? undefined
    : navItems.filter((item) => pathname === item.href || pathname?.startsWith(`${item.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]
        ?.href;

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar — deliberately stays on the dark chrome palette
          (sidebar-*) rather than the light content-area tokens, at the
          user's request. Subtle top-to-bottom gloss (2026-08-16, "premier
          black gloss" pass) rather than a flat fill — a faint highlight
          near the top edge is what actually reads as gloss/depth rather
          than plain matte black. */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-gradient-to-b from-[#141414] via-sidebar-background to-black md:flex">
        <div className="flex items-center gap-2 px-5 py-6">
          <Logo />
          <span className="text-xs font-medium tracking-wide text-sidebar-muted-foreground">PodHQ</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-gradient-to-r from-sidebar-accent to-sidebar-accent-hover text-sidebar-accent-foreground shadow-[0_0_24px_-6px_var(--sidebar-accent)]"
                    : "text-sidebar-muted-foreground hover:bg-white/5 hover:text-sidebar-foreground"
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
      <div className="flex items-center justify-between border-b border-sidebar-border bg-gradient-to-b from-[#141414] to-black px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-xs font-medium tracking-wide text-sidebar-muted-foreground">PodHQ</span>
        </div>
        <SignOutButton />
      </div>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-sidebar-border bg-gradient-to-t from-[#141414] to-black md:hidden">
        {navItems.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                active ? "text-sidebar-accent" : "text-sidebar-muted-foreground"
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
