import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/stats/format";
import type { SlowCorrectQuestion } from "@/lib/stats/aggregate";

const DIFFICULTY_LABEL = { E: "Easy", M: "Medium", H: "Hard" } as const;

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Individual correct-but-slow answers, worst-pace-overrun first — pulled
 *  from both practice sets and practice tests (see `PacingStats`'s comment
 *  in aggregate.ts for why those are combined here). Links to the
 *  originating set's results page (identifiable by mode + name + date)
 *  rather than the skill's study material — the point of this table is
 *  finding the actual question again, which the results page's "Question
 *  review" section lists (no per-item anchor to jump straight to it yet,
 *  but the domain/skill/difficulty shown here narrows it down). A
 *  `/sets/[id]/results` link for an exam-mode set redirects to
 *  `/tests/[id]/results` on its own (see that page), so the href never
 *  needs to branch on `mode`. */
export function SlowCorrectTable({ questions }: { questions: SlowCorrectQuestion[] }) {
  if (questions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Correct, but slow</CardTitle>
        <CardDescription>
          You got these right, but took well over your normal pace for that section and difficulty — worth a review
          pass even though the answer was correct.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {questions.map((q) => (
            <Link
              key={q.attemptId}
              href={`/sets/${q.setId}/results`}
              className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{q.skillLabel}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {q.sectionCode === "MATH" ? "Math" : "Reading and Writing"} · {DIFFICULTY_LABEL[q.difficulty as "E" | "M" | "H"] ?? q.difficulty} ·{" "}
                  {q.mode === "exam" ? "Practice test" : "Practice set"}: {q.setName} · {formatShortDate(q.submittedAt)}
                </span>
              </div>
              <div className="shrink-0 text-right font-mono text-xs text-muted-foreground">
                {formatDuration(q.totalMs)}
                <span className="ml-1.5 text-muted-foreground/70">(usual ~{formatDuration(q.baselineMs)})</span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
