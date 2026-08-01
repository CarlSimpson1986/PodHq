"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { formatGBP, formatMonthLabel } from "@/lib/format";

const ACCENT = "#c9a24b";
const GRID = "#2a2d3a";
const MUTED = "#9a9ba3";

export function OutgoingsHistoryChart({ data }: { data: { month: string; totalGbp: number }[] }) {
  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Outgoings trend (last 12 months)</p>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: 8, right: 8 }}>
            <defs>
              <linearGradient id="outgoingsTrendFill" x1="0" y1="0" x2="0" y2="1">
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
              formatter={(value) => [formatGBP(Number(value)), "Outgoings"]}
            />
            <Area type="monotone" dataKey="totalGbp" stroke={ACCENT} strokeWidth={2} fill="url(#outgoingsTrendFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Outgoings trend, last 12 months</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Outgoings</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.month}>
              <td>{formatMonthLabel(row.month)}</td>
              <td>{formatGBP(row.totalGbp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
