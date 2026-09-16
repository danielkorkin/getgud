import { redirect, notFound } from "next/navigation";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/profile";
import { loadExamState, currentModule, isModuleExpired } from "@/lib/exam/state";
import { ExamRunner } from "@/components/exam/exam-runner";
import type { ExamNavItemState } from "@/components/exam/exam-question-nav";

export default async function ExamRunnerPage({ params }: PageProps<"/tests/[sessionId]">) {
  const { sessionId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const state = await loadExamState(sessionId);
  if (!state) notFound();
  if (state.phase === "completed") redirect(`/tests/${sessionId}/results`);

  const mod = currentModule(state);
  const expired = isModuleExpired(state);

  let navItems: ExamNavItemState[] = [];
  let initialPosition = mod?.startPosition ?? 0;

  if (mod) {
    const items = await db.orm.public.PracticeSetItem
      .where({ setId: sessionId })
      .orderBy((i) => i.position.asc())
      .all();
    const inRange = items.filter((it) => it.position >= mod.startPosition && it.position < mod.startPosition + mod.itemCount);
    const attempts = await db.orm.public.Attempt.where({ setId: sessionId }).all();
    const attemptByItemId = new Map(attempts.map((a) => [a.itemId, a]));

    navItems = inRange.map((item) => {
      const attempt = attemptByItemId.get(item.id);
      return {
        position: item.position,
        numberInModule: item.position - mod.startPosition + 1,
        answered: attempt?.status === "answered",
        markedForReview: attempt?.markedForReview ?? false,
      };
    });

    initialPosition = Math.min(Math.max(state.set.currentIndex, mod.startPosition), mod.startPosition + mod.itemCount - 1);
  }

  return (
    <ExamRunner
      sessionId={sessionId}
      examName={state.blueprint.name}
      phase={state.phase}
      serverNow={state.serverNow}
      module={mod}
      breakStartedAt={state.breakStartedAt}
      breakEndsAt={state.breakEndsAt}
      initialPosition={initialPosition}
      navItems={navItems}
      expired={expired}
    />
  );
}
