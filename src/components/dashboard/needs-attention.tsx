interface NeedsAttentionProps {
  missingOutgoingsCategories: string[];
  hasAttendanceData: boolean;
}

export function NeedsAttention({ missingOutgoingsCategories, hasAttendanceData }: NeedsAttentionProps) {
  const items: string[] = [];

  if (!hasAttendanceData) {
    items.push("No attendance data recorded for this gym this month.");
  }
  if (missingOutgoingsCategories.length > 0) {
    items.push(
      `Outgoings not yet entered for: ${missingOutgoingsCategories.join(", ")}. Net P&L on the Outgoings page is understating true costs until these are set.`
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-[12px] border border-warning/40 bg-card p-5">
      <p className="text-sm font-semibold text-foreground">Needs attention</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-warning">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
