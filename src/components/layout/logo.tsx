export function Logo({ className = "" }: { className?: string }) {
  return (
    // Plain <img>, not next/image: it's a fixed-size 10KB asset with no need
    // for responsive srcset, and the /_next/image optimizer route 400s on it
    // in this project's setup (proxy.ts's matcher isn't scoped to exclude
    // arbitrary /public files, only _next/image itself).
    <img src="/logo-mark.png" alt="My Fit Pod" className={`h-14 w-14 ${className}`} />
  );
}
