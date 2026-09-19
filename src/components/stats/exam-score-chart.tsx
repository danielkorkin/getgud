"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ExamScorePoint } from "@/lib/stats/aggregate";
import { StatCard } from "@/components/stats/stat-card";

const chartConfig: ChartConfig = {
  rw: { label: "Reading and Writing", color: "var(--chart-1)" },
  math: { label: "Math", color: "var(--chart-2)" },
};

export function ExamScoreChart({ data }: { data: ExamScorePoint[] }) {
  if (data.length === 0) return null;
  const latest = data[data.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Latest total (out of 1600)" value={String(latest.totalScaled)} />
        <StatCard label="Latest R&W" value={latest.rwScaled != null ? String(latest.rwScaled) : "—"} />
        <StatCard label="Latest Math" value={latest.mathScaled != null ? String(latest.mathScaled) : "—"} />
      </div>

      {data.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score trend</CardTitle>
            <CardDescription>Scaled section scores across completed practice tests.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
              <LineChart data={data} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="completedAt"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                />
                <YAxis domain={[200, 800]} tickLine={false} axisLine={false} width={36} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line type="monotone" dataKey="rwScaled" name="rw" stroke="var(--color-rw)" strokeWidth={2} dot isAnimationActive={false} />
                <Line type="monotone" dataKey="mathScaled" name="math" stroke="var(--color-math)" strokeWidth={2} dot isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
