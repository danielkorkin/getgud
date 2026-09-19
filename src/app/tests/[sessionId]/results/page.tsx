import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { loadExamState } from "@/lib/exam/state";
import { domainLabel, skillLabel } from "@/lib/catalog";
import { renderContentField } from "@/lib/content/render";
import type { AnswerOption } from "@/lib/grading";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExamReviewAccordion, type ExamReviewRow } from "@/components/exam/exam-review-accordion";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default async function ExamResultsPage({ params }: PageProps<"/tests/[sessionId]/results">) {
  const { sessionId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const state = await loadExamState(sessionId);
  if (!state) notFound();
  if (state.phase !== "completed" || !state.scores) redirect(`/tests/${sessionId}`);

  const items = await db.orm.public.PracticeSetItem.where({ setId: sessionId }).orderBy((i) => i.position.asc()).all();
  const attempts = await db.orm.public.Attempt.where({ setId: sessionId }).all();
  const attemptByItemId = new Map(attempts.map((a) => [a.itemId, a]));
  const questions = await db.orm.public.Question.where((q) => q.id.in(items.map((i) => i.questionId))).all();
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const bySkill = new Map<string, { correct: number; graded: number; sectionCode: string }>();
  const rows: ExamReviewRow[] = [];

  for (const item of items) {
    const attempt = attemptByItemId.get(item.id);
    const question = questionById.get(item.questionId);
    if (!question) continue;

    if (attempt?.gradable && attempt.isCorrect !== null) {
      const entry = bySkill.get(item.skillCode) ?? { correct: 0, graded: 0, sectionCode: item.sectionCode };
      entry.graded += 1;
      if (attempt.isCorrect) entry.correct += 1;
      bySkill.set(item.skillCode, entry);
    }

    const options = (question.answerOptions as AnswerOption[] | null)?.map((o) => ({
      id: o.id,
      letter: o.letter,
      html: renderContentField({ html: o.content, contentHash: question.contentHash, field: `option:${o.id}` }),
    })) ?? null;
    const correctOption = options?.find((o) => question.correctKeys.includes(o.id)) ?? null;

    rows.push({
      position: item.position,
      numberInExam: item.position + 1,
      sectionCode: item.sectionCode as "RW" | "MATH",
      domainLabel: domainLabel(item.domainCode),
      skillLabel: skillLabel(item.skillCode),
      markedForReview: attempt?.markedForReview ?? false,
      activeMs: attempt?.activeMs ?? 0,
      isCorrect: attempt?.isCorrect ?? null,
      gradable: attempt?.gradable ?? item.gradable,
      stimulusHtml: question.stimulus ? renderContentField({ html: question.stimulus, contentHash: question.contentHash, field: "stimulus" }) : null,
      stemHtml: renderContentField({ html: question.stem, contentHash: question.contentHash, field: "stem" }),
      rationaleHtml: renderContentField({ html: question.rationale, contentHash: question.contentHash, field: "rationale" }),
      type: item.type as "mcq" | "spr",
      options,
      selectedOptionId: attempt?.selectedOptionId ?? null,
      correctOptionId: correctOption?.id ?? null,
      correctAnswer: question.correctAnswer,
      spResponse: attempt?.spResponse ?? null,
    });
  }

  const rwRows = rows.filter((r) => r.sectionCode === "RW");
  const mathRows = rows.filter((r) => r.sectionCode === "MATH");
  const totalActiveMs = attempts.reduce((sum, a) => sum + a.activeMs, 0);

  const SECTION_LABEL: Record<"RW" | "MATH", string> = { RW: "Reading and Writing", MATH: "Math" };
  const firstFinishedAt = state.modules.find((m) => m.sectionCode === state.sectionOrder[0] && m.moduleIndex === 2)?.submittedAt;
  const secondStartedAt = state.modules.find((m) => m.sectionCode === state.sectionOrder[1] && m.moduleIndex === 1)?.startedAt;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="self-start" render={<Link href="/tests" />} nativeButton={false}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to practice tests
        </Button>
        <h1 className="text-4xl font-medium tracking-tight">{state.blueprint.name}</h1>
        <p className="text-sm text-muted-foreground">
          Total active time: {formatDuration(totalActiveMs)}
        </p>
      </header>

      {state.splitSitting && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taken in two sittings</CardTitle>
            <CardDescription>
              You took {SECTION_LABEL[state.sectionOrder[0]]} and {SECTION_LABEL[state.sectionOrder[1]]} separately.
              {firstFinishedAt && (
                <>
                  {" "}
                  {SECTION_LABEL[state.sectionOrder[0]]} finished {new Date(firstFinishedAt).toLocaleString()}
                </>
              )}
              {secondStartedAt && (
                <>
                  ; {SECTION_LABEL[state.sectionOrder[1]]} started {new Date(secondStartedAt).toLocaleString()}.
                </>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-4xl">{state.scores.totalScaled}</CardTitle>
            <CardDescription>Total score (out of 1600)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-3xl">{state.scores.rwScaled}</CardTitle>
              <Badge variant="secondary">{state.scores.rwVariant === "upper" ? "Harder module" : "Easier module"}</Badge>
            </div>
            <CardDescription>
              Reading and Writing · {state.scores.rwRaw} raw correct
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-3xl">{state.scores.mathScaled}</CardTitle>
              <Badge variant="secondary">{state.scores.mathVariant === "upper" ? "Harder module" : "Easier module"}</Badge>
            </div>
            <CardDescription>
              Math · {state.scores.mathRaw} raw correct
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {bySkill.size > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-medium tracking-tight">By skill</h2>
          <div className="flex flex-col gap-1.5">
            {[...bySkill.entries()].map(([skillCode, { correct, graded }]) => (
              <div key={skillCode} className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2 text-sm">
                <span>{skillLabel(skillCode)}</span>
                <span className="font-mono text-muted-foreground">
                  {correct}/{graded}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium tracking-tight">Reading and Writing — question review</h2>
        <ExamReviewAccordion rows={rwRows} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-medium tracking-tight">Math — question review</h2>
        <ExamReviewAccordion rows={mathRows} />
      </section>
    </div>
  );
}
