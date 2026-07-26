export default function MembersLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="h-6 w-40 animate-pulse rounded bg-card" />
      <div className="mt-6 flex gap-2">
        <div className="h-8 w-8 animate-pulse rounded-md bg-card" />
        <div className="h-8 w-32 animate-pulse rounded-md bg-card" />
        <div className="h-8 w-8 animate-pulse rounded-md bg-card" />
      </div>
      <div className="mt-4 h-24 animate-pulse rounded-[12px] border border-card-border bg-card" />
    </main>
  );
}
