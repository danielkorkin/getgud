"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { AccuracyPoint } from "@/lib/stats/aggregate";

const chartConfig: ChartConfig = { rate: { label: "Accuracy", color: "var(--chart-1)" } };

export function AccuracyTrendChart({ data }: { data: AccuracyPoint[] }) {
  if (data.length < 2) return null;

  const chartData = data.map((d) => ({
    bucketStart: d.bucketStart,
    rate: Math.round((d.correct / d.graded) * 100),
    graded: d.graded,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accuracy over time</CardTitle>
        <CardDescription>Graded practice questions, grouped by day or week.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
          <LineChart data={chartData} margin={{ left: 8, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="bucketStart"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
            <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Line type="monotone" dataKey="rate" stroke="var(--color-rate)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
