"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface RateBarDatum {
  key: string;
  label: string;
  rate: number;
  graded: number;
}

/** A horizontal bar chart of accuracy by category — the generic form reused
 *  for by-domain, hint-impact, and time-quartile breakdowns (all "rate per
 *  ≤4-category bucket" shapes). Difficulty gets its own component since it
 *  needs per-bar semantic colors instead of one hue. */
export function RateBarChart({
  title,
  description,
  data,
  color = "var(--chart-1)",
  referenceValue,
  referenceLabel = "Your average",
}: {
  title: string;
  description?: string;
  data: RateBarDatum[];
  color?: string;
  /** Overall accuracy (0-1) to draw as a dashed comparison line, so each bar
   *  reads against "your average" instead of only against each other. */
  referenceValue?: number;
  referenceLabel?: string;
}) {
  const shown = data.filter((d) => d.graded > 0);
  if (shown.length === 0) return null;

  const chartConfig: ChartConfig = { rate: { label: "Accuracy", color } };
  const chartData = shown.map((d) => ({ label: d.label, rate: Math.round(d.rate * 100), graded: d.graded }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[180px] w-full">
          <BarChart data={chartData} layout="vertical" margin={{ top: 20, left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={132} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="rate" fill="var(--color-rate)" radius={4} isAnimationActive={false} minPointSize={2} />
            {referenceValue != null && (
              <ReferenceLine
                x={Math.round(referenceValue * 100)}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                label={{ value: referenceLabel, position: "top", fill: "var(--muted-foreground)", fontSize: 11 }}
              />
            )}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
