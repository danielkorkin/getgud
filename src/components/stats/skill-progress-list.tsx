import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import type { SkillRow } from "@/lib/stats/aggregate";

/** A list with Progress-bar meters, not a chart — ~20 long text labels
 *  blow past the ~7-category ceiling a bar chart reads well at, so this
 *  extends the same skill-row pattern already used on the per-set results
 *  page instead of inventing a new chart type. */
export function SkillProgressList({ skills }: { skills: SkillRow[] }) {
  if (skills.length === 0) return null;

  const rw = skills.filter((s) => s.sectionCode === "RW");
  const math = skills.filter((s) => s.sectionCode === "MATH");

  return (
    <div className="flex flex-col gap-5">
      {rw.length > 0 && <SkillGroup title="Reading and Writing" skills={rw} />}
      {math.length > 0 && <SkillGroup title="Math" skills={math} />}
    </div>
  );
}

function SkillGroup({ title, skills }: { title: string; skills: SkillRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="flex flex-col gap-3">
        {skills.map((s) => (
          <Link
            key={s.skillCode}
            href={`/learn/topics/${s.domainCode}#skill-${s.skillCode}`}
            className="group flex flex-col gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{s.skillLabel}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {s.correct}/{s.graded}
              </span>
            </div>
            <Progress value={Math.round(s.rate * 100)} />
          </Link>
        ))}
      </div>
    </div>
  );
}
