"use client";

import { Area, AreaChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { formatGBP, formatMonthLabel } from "@/lib/format";
import type { CategoryBreakdown } from "@/lib/data/revenue";

const MEMBERSHIP = "#c9a24b";
const CREDIT_PACK = "#3987e5";
const GRID = "#2a2d3a";
const MUTED = "#9a9ba3";

export function CategoryTrendChart({ data }: { data: ({ month: string } & CategoryBreakdown)[] }) {
  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Category mix (last 12 months)</p>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: 8, right: 8 }}>
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
            <Area
              type="monotone"
              dataKey="membership"
              name="Memberships"
              stackId="category"
              stroke={MEMBERSHIP}
              strokeWidth={2}
              fill={MEMBERSHIP}
              fillOpacity={0.7}
            />
            <Area
              type="monotone"
              dataKey="creditPack"
              name="PAYG / Packs"
              stackId="category"
              stroke={CREDIT_PACK}
              strokeWidth={2}
              fill={CREDIT_PACK}
              fillOpacity={0.7}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
