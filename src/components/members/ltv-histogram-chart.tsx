"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { formatGBP } from "@/lib/format";
import type { LtvHistogramBucket } from "@/lib/data/members";

const ACCENT = "#c9a24b";
const GRID = "#2a2d3a";
const MUTED = "#9a9ba3";

export function LtvHistogramChart({ data }: { data: LtvHistogramBucket[] }) {
  const chartData = data.map((bucket) => ({
    label: `${formatGBP(bucket.rangeStart).replace(/\.00$/, "")}–${formatGBP(bucket.rangeEnd).replace(/\.00$/, "")}`,
    count: bucket.count,
  }));

  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">LTV distribution</p>
      {chartData.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Not enough customer history yet.</p>
      ) : (
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ left: 8, right: 16, bottom: 24 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="label"
                stroke={GRID}
                tick={{ fill: MUTED, fontSize: 11 }}
                tickLine={false}
                angle={-35}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke={GRID} tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#ffffff08" }}
                contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8 }}
                labelStyle={{ color: "#ffffff" }}
                itemStyle={{ color: ACCENT }}
                formatter={(value) => [value, "Customers"]}
              />
              <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <table className="sr-only">
        <caption>LTV distribution</caption>
        <thead>
          <tr>
            <th>Range</th>
            <th>Customers</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
