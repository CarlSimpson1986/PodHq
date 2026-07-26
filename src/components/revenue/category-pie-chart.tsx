"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatGBP } from "@/lib/format";
import type { CategoryBreakdown } from "@/lib/data/revenue";

const MEMBERSHIP = "#c9a24b";
const CREDIT_PACK = "#3987e5";

export function CategoryPieChart({ data }: { data: CategoryBreakdown }) {
  const rows = [
    { name: "Memberships", value: data.membership, color: MEMBERSHIP },
    { name: "PAYG / Packs", value: data.creditPack, color: CREDIT_PACK },
  ];
  const total = data.membership + data.creditPack;

  return (
    <div className="rounded-[12px] border border-card-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">Revenue by category</p>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              stroke="#1a1d27"
              strokeWidth={2}
            >
              {rows.map((row) => (
                <Cell key={row.name} fill={row.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8 }}
              labelStyle={{ color: "#ffffff" }}
              formatter={(value, name) => [
                `${formatGBP(Number(value))} (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : "0"}%)`,
                name,
              ]}
            />
            <Legend
              verticalAlign="bottom"
              formatter={(value) => <span style={{ color: "#9a9ba3" }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Revenue by category</caption>
        <thead>
          <tr>
            <th>Category</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{formatGBP(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
