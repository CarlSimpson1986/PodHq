import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm card-glass p-8">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-xs font-medium tracking-wide text-muted-foreground">PodHQ</span>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
