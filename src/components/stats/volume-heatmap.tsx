import { cn } from "cn";
import type { VolumeStats } from "@/lib/stats/aggregate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const WEEKS_SHOWN = 18;

function levelFor(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

// Sequential single-hue ramp on the primary accent — a calendar heatmap has
// no natural Recharts primitive, so this is a plain CSS grid, GitHub
// contribution-graph style.
const LEVEL_CLASS = {
  0: "bg-muted",
  1: "bg-primary/25",
  2: "bg-primary/50",
  3: "bg-primary/75",
  4: "bg-primary",
} as const;

export function VolumeHeatmap({ volume }: { volume: VolumeStats }) {
  if (volume.byDate.length === 0) return null;

  const countByDate = new Map(volume.byDate.map((d) => [d.date, d.count]));
  const max = Math.max(...volume.byDate.map((d) => d.count));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days: { date: string; count: number }[] = [];
  for (let i = WEEKS_SHOWN * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: countByDate.get(key) ?? 0 });
  }
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Practice volume</CardTitle>
        <CardDescription>
          {volume.currentStreakDays > 0
            ? `${volume.currentStreakDays}-day streak (longest: ${volume.longestStreakDays})`
            : `Longest streak: ${volume.longestStreakDays} days`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-[3px] overflow-x-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count} question${d.count === 1 ? "" : "s"}`}
                  className={cn("size-3 rounded-[2px]", LEVEL_CLASS[levelFor(d.count, max)])}
                />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
