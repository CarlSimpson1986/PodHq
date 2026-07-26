"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { formatGBP, formatMonthLabel } from "@/lib/format";

const ACCENT = "#c9a24b";
const GRID = "#2a2d3a";
const MUTED = "#9a9ba3";

export function RevenueTrendChart({ data }: { data: { month: string; total: number }[] }) {
  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">Revenue trend (last 12 months)</p>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: 8, right: 8 }}>
            <defs>
              <linearGradient id="revenueTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.1} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthLabel}
              stroke={GRID}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatGBP(v).replace(/\.00$/, "")}
              stroke={GRID}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
              width={70}
            />
            <Tooltip
              cursor={{ stroke: GRID }}
              contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8 }}
              labelStyle={{ color: "#ffffff" }}
              labelFormatter={(label) => formatMonthLabel(String(label))}
              itemStyle={{ color: ACCENT }}
              formatter={(value) => [formatGBP(Number(value)), "Revenue"]}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#revenueTrendFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Revenue trend, last 12 months</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.month}>
              <td>{formatMonthLabel(row.month)}</td>
              <td>{formatGBP(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
