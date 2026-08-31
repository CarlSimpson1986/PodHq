export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="h-6 w-24 animate-pulse rounded bg-card" />
      <div className="mt-2 h-6 w-40 animate-pulse rounded bg-card" />
      <div className="mt-6 h-28 animate-pulse card-glass" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="h-24 animate-pulse card-glass" />
        <div className="h-24 animate-pulse card-glass" />
        <div className="h-24 animate-pulse card-glass" />
      </div>
      <div className="mt-4 h-80 animate-pulse card-glass" />
    </main>
  );
}
