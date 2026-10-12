// Shared DB-reading half of the stats feature — both the page
// (src/app/stats/page.tsx) and the AI analysis action (src/actions/stats.ts)
// need the exact same bundle, so the query + aggregate step lives here once.
import "server-only";

import { db } from "@/prisma/db";
import { getExam } from "@/exams";
import { isPsat } from "@/exams/spec";
import { buildStatsBundle, type ExamMeta, type StatsBundle } from "@/lib/stats/aggregate";

function examMeta(examId: string): ExamMeta {
  const bp = getExam(examId);
  // A blueprint removed from the registry after a session was taken falls
  // back to the SAT scale, which is what every pre-PSAT session used.
  if (!bp) return { name: examId, assessment: "SAT", sectionMin: 200, sectionMax: 800 };
  return { name: bp.name, assessment: isPsat(bp) ? "PSAT" : "SAT", sectionMin: bp.scale.sectionMin, sectionMax: bp.scale.sectionMax };
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

  return buildStatsBundle({ sets, examSessions, attempts, examMeta });
}
