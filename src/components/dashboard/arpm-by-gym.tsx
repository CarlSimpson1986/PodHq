import { formatGBP } from "@/lib/format";
import type { GymArpm } from "@/lib/data/dashboard";

export function ArpmByGym({ data }: { data: GymArpm[] }) {
  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Revenue per member by gym</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Gyms price differently, so this is more actionable than a single blended average.
        Customer count is from paid transactions, not attendance — stays accurate even
        when a gym&apos;s attendance data hasn&apos;t synced yet.
      </p>
      <ul className="mt-3 divide-y divide-card-border">
        {data.map((row) => (
          <li key={row.gym} className="flex items-center justify-between py-2 text-sm">
            <span className="text-foreground">{row.gym}</span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {row.payingCustomers} paying customers
              </span>
              <span className="tabular-nums text-foreground">
                {row.arpm !== null ? formatGBP(row.arpm) : "—"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
