"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { DifficultyRow } from "@/lib/stats/aggregate";

const LABEL = { E: "Easy", M: "Medium", H: "Hard" } as const;
// Reuses the app's existing green/amber/red difficulty semantics (see
// DIFFICULTY_VARIANT in the results pages) rather than generic chart hues —
// this is an ordinal severity scale the app already colors this way
// everywhere else.
const FILL = { E: "var(--tag-green-foreground)", M: "var(--tag-yellow-foreground)", H: "var(--tag-red-foreground)" } as const;

export function DifficultyBarChart({ data, referenceValue }: { data: DifficultyRow[]; referenceValue?: number }) {
  const shown = data.filter((d) => d.graded > 0);
  if (shown.length === 0) return null;

  const chartConfig: ChartConfig = { rate: { label: "Accuracy" } };
  const chartData = shown.map((d) => ({ label: LABEL[d.difficulty], difficulty: d.difficulty, rate: Math.round(d.rate * 100), graded: d.graded }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">By difficulty</CardTitle>
        <CardDescription>Where the missed points are concentrated.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[140px] w-full">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={72} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="rate" radius={4} isAnimationActive={false} minPointSize={2}>
              {chartData.map((d) => (
                <Cell key={d.difficulty} fill={FILL[d.difficulty as "E" | "M" | "H"]} />
              ))}
            </Bar>
            {referenceValue != null && (
              <ReferenceLine
                x={Math.round(referenceValue * 100)}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                label={{ value: "Your average", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
              />
            )}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
