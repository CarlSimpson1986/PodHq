export default function DoorTrafficLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="h-6 w-48 animate-pulse rounded bg-card" />
      <div className="mt-6 flex gap-2">
        <div className="h-8 w-32 animate-pulse rounded-md bg-card" />
        <div className="h-8 w-40 animate-pulse rounded-md bg-card" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse card-glass" />
        ))}
      </div>
      <div className="mt-4 h-72 animate-pulse card-glass" />
    </main>
  );
}
