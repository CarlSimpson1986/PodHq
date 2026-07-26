"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { formatGBP } from "@/lib/format";
import type { GymRevenue } from "@/lib/data/dashboard";

const ACCENT = "#c9a24b";
const GRID = "#2a2d3a";
const MUTED = "#9a9ba3";

export function RevenueByGymChart({ data }: { data: GymRevenue[] }) {
  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">Revenue by gym</p>
      <div className="mt-4 h-80 w-full">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatGBP(v).replace(/\.00$/, "")}
              stroke={GRID}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="gym"
              width={140}
              stroke={GRID}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "#ffffff08" }}
              contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8 }}
              labelStyle={{ color: "#ffffff" }}
              itemStyle={{ color: ACCENT }}
              formatter={(value) => [formatGBP(Number(value)), "Revenue"]}
            />
            <Bar dataKey="total" fill={ACCENT} radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Revenue by gym</caption>
        <thead>
          <tr>
            <th>Gym</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.gym}>
              <td>{row.gym}</td>
              <td>{formatGBP(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
