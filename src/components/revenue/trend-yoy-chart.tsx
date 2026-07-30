"use client";

import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { formatGBP, formatMonthLabel } from "@/lib/format";
import type { TrendPoint } from "@/lib/data/revenue";

const ACCENT = "#c9a24b";
const DEEMPHASIS = "#5a5d6b";
const GRID = "#2a2d3a";
const MUTED = "#9a9ba3";

export function TrendYoyChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Monthly trend vs last year (last 12 months)</p>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 8 }}>
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
              contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8 }}
              labelStyle={{ color: "#ffffff" }}
              labelFormatter={(label) => formatMonthLabel(String(label))}
              formatter={(value) => formatGBP(Number(value))}
            />
            <Legend formatter={(value) => <span style={{ color: MUTED }}>{value}</span>} />
            <Line
              type="monotone"
              dataKey="priorYear"
              name="Last year"
              stroke={DEEMPHASIS}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="current"
              name="This year"
              stroke={ACCENT}
              strokeWidth={2}
              dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
