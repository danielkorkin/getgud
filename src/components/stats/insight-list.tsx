import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, LightbulbIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import type { Insight } from "@/lib/stats/aggregate";

const ICON = { info: InfoIcon, notice: WarningIcon, opportunity: LightbulbIcon } as const;

export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {insights.map((insight) => {
        const Icon = ICON[insight.severity];
        return (
          <Alert key={insight.id}>
            <Icon />
            <AlertDescription>{insight.text}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
