"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#ffc658"];

export function UsageLineChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-text-muted">No usage data available.</div>;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
          <XAxis 
            dataKey="date" 
            tickFormatter={(val) => val.split("-").slice(1).join("/")} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: "currentColor", opacity: 0.6, fontSize: 12 }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: "currentColor", opacity: 0.6, fontSize: 12 }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px" }}
            itemStyle={{ color: "var(--text-main)" }}
          />
          <Line type="monotone" dataKey="requests" name="Requests" stroke="#0088FE" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="cost" name="Cost ($)" stroke="#00C49F" strokeWidth={2} dot={false} yAxisId="right" />
          <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "currentColor", opacity: 0.6, fontSize: 12 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostPieChart({ data }: { data: any[] }) {
  const chartData = useMemo(() => {
    return data
      .filter((d) => d.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 7); // Top 7 providers
  }, [data]);

  if (!chartData || chartData.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-text-muted">No cost data available.</div>;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="cost"
            nameKey="provider"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
            contentStyle={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProviderBarChart({ data }: { data: any[] }) {
  const chartData = useMemo(() => {
    return data
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 7); // Top 7 providers
  }, [data]);

  if (!chartData || chartData.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-text-muted">No provider data available.</div>;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
          <XAxis 
            dataKey="provider" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: "currentColor", opacity: 0.6, fontSize: 12 }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: "currentColor", opacity: 0.6, fontSize: 12 }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px" }}
            itemStyle={{ color: "var(--text-main)" }}
          />
          <Bar dataKey="requests" name="Requests" fill="#8884d8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
