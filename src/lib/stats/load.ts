// Shared DB-reading half of the stats feature — both the page
// (src/app/stats/page.tsx) and the AI analysis action (src/actions/stats.ts)
// need the exact same bundle, so the query + aggregate step lives here once.
import "server-only";

import { db } from "@/prisma/db";
import { getExam } from "@/exams";
import { buildStatsBundle, type StatsBundle } from "@/lib/stats/aggregate";

function examName(examId: string): string {
  return getExam(examId)?.name ?? examId;
}

export async function loadStatsBundle(profileId: string): Promise<StatsBundle> {
  const [sets, examSessions, attempts] = await Promise.all([
    db.orm.public.PracticeSet.select(
      "id",
      "mode",
      "status",
      "name",
      "assessment",
      "questionCount",
      "correctCount",
      "gradedCount",
      "totalActiveMs",
      "createdAt",
      "startedAt",
      "completedAt",
    )
      .where({ profileId })
      .all(),

    db.orm.public.ExamSession.select("id", "setId", "examId", "phase", "rwScaled", "mathScaled", "totalScaled", "completedAt")
      .where({ profileId })
      .all(),

    db.orm.public.Attempt.select(
      "id",
      "setId",
      "assessment",
      "sectionCode",
      "domainCode",
      "skillCode",
      "difficulty",
      "scoreBand",
      "type",
      "status",
      "isCorrect",
      "gradable",
      "submittedAt",
      "activeMs",
      "totalMs",
      "timeToFirstInputMs",
      "timeAfterFeedbackMs",
      "answerChangeCount",
      "markedForReview",
      "eliminationCount",
      "hintsUsed",
      "maxHintLevel",
      "answerRevealed",
      "calculatorOpened",
      "referenceOpened",
      "highlightCount",
    )
      .where({ profileId })
      .all(),
  ]);

  return buildStatsBundle({ sets, examSessions, attempts, examName });
}
