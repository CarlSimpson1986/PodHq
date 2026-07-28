"use client";

import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { formatDate } from "@/lib/format";
import type { WeeklyAdSpend } from "@/lib/data/marketing";

const RATE = "#3987e5";
const GRID = "#2a2d3a";
const MUTED = "#9a9ba3";

interface WeeklyRateChartProps {
  title: string;
  data: WeeklyAdSpend[];
  dataKey: "cpc" | "cpl";
  seriesName: string;
  formatValue: (v: number) => string;
}

/** Shared line-chart shape for CPC and CPL — same axes, tooltip, and
 *  single-series color, differing only in which derived rate they plot. */
export function WeeklyRateChart({ title, data, dataKey, seriesName, formatValue }: WeeklyRateChartProps) {
  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="weekStarting"
              tickFormatter={(v: string) => formatDate(v)}
              stroke={GRID}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatValue(v)}
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
              itemStyle={{ color: RATE }}
              formatter={(value) => [value == null ? "—" : formatValue(Number(value)), seriesName]}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              name={seriesName}
              stroke={RATE}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Week</th>
            <th>{seriesName}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.weekStarting}>
              <td>{formatDate(row.weekStarting)}</td>
              <td>{row[dataKey] == null ? "—" : formatValue(Number(row[dataKey]))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
