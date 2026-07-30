"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { formatGBP, formatDate } from "@/lib/format";
import type { WeeklyAdSpend } from "@/lib/data/marketing";

const ACCENT = "#c9a24b";
const GRID = "#2a2d3a";
const MUTED = "#9a9ba3";

export function WeeklySpendChart({ data }: { data: WeeklyAdSpend[] }) {
  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Weekly ad spend (last 12 weeks)</p>
      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: 8, right: 8 }}>
            <defs>
              <linearGradient id="weeklySpendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.1} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="weekStarting"
              tickFormatter={(v: string) => formatDate(v)}
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
              labelFormatter={(label) => `Week of ${formatDate(String(label))}`}
              itemStyle={{ color: ACCENT }}
              formatter={(value) => [formatGBP(Number(value)), "Spend"]}
            />
            <Area type="monotone" dataKey="spendGbp" stroke={ACCENT} strokeWidth={2} fill="url(#weeklySpendFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Weekly ad spend, last 12 weeks</caption>
        <thead>
          <tr>
            <th>Week</th>
            <th>Spend</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.weekStarting}>
              <td>{formatDate(row.weekStarting)}</td>
              <td>{formatGBP(row.spendGbp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
