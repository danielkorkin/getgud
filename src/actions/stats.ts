"use server";

import { generateObject } from "ai";
import { requireProfileId } from "@/lib/profile";
import { hintsConfigured, getAnalysisModel } from "@/lib/ai/hint-provider";
import { buildRecommendationPrompt, type StatsSummaryInput } from "@/lib/ai/stats-prompt";
import { AnalysisSchema, type Analysis } from "@/lib/ai/stats-schema";
import { computeInsights } from "@/lib/stats/insights";
import { loadStatsBundle } from "@/lib/stats/load";
import { loadChatExcerpts, type ChatExcerpt } from "@/lib/stats/chat-history";
import { loadQuestionDetails, type QuestionDetails } from "@/lib/stats/question-details";
import type { StatsBundle } from "@/lib/stats/aggregate";

function toStatsSummaryInput(bundle: StatsBundle, chatExcerpts: ChatExcerpt[], questionDetails: QuestionDetails): StatsSummaryInput {
  const insights = computeInsights(bundle.practice, bundle.exam, bundle.pacing);
  return {
    overallAccuracy: bundle.practice?.overallAccuracy ?? 0,
    totalGraded: bundle.practice?.totalGraded ?? 0,
    // Never send a skill the model shouldn't recommend against — the schema
    // enum would reject a fabricated code anyway, but keeping low-n skills
    // out of the prompt entirely stops the model from reasoning about them.
    bySkill: (bundle.practice?.bySkill ?? [])
      .filter((s) => s.graded >= 3)
      .map((s) => ({
        skillCode: s.skillCode,
        skillLabel: s.skillLabel,
        domainCode: s.domainCode,
        sectionCode: s.sectionCode as "RW" | "MATH",
        correct: s.correct,
        graded: s.graded,
      })),
    byDifficulty: bundle.practice?.byDifficulty ?? [],
    hintImpact: bundle.practice?.hintImpact ?? [],
    // Combined across practice sets and practice tests (see `PacingStats`'s
    // comment in aggregate.ts) — unlike the fields above, which stay
    // practice-only.
    markForReview: bundle.pacing?.markForReview ?? [],
    calculatorUsage: bundle.practice?.calculatorUsage ?? [],
    referenceSheetUsage: bundle.practice?.referenceSheetUsage ?? [],
    byTimeOfDay: bundle.practice?.byTimeOfDay ?? [],
    trend: bundle.practice?.trend ?? null,
    // Same low-n guard as bySkill above, plus only send skills that actually
    // show the pattern — no point spending prompt space on a skill with
    // zero slow-correct or rushed-wrong answers. Also combined across both
    // modes.
    pacingConcerns: (bundle.pacing?.bySkill ?? [])
      .filter((s) => s.correctGraded >= 3 && s.slowCorrectCount > 0)
      .sort((a, b) => b.slowCorrectRate - a.slowCorrectRate)
      .slice(0, 5)
      .map((s) => ({ skillCode: s.skillCode, skillLabel: s.skillLabel, correctGraded: s.correctGraded, slowCorrectCount: s.slowCorrectCount })),
    rushedMistakes: (bundle.pacing?.bySkill ?? [])
      .filter((s) => s.triedWrong >= 3 && s.rushedWrongCount > 0)
      .sort((a, b) => b.rushedWrongRate - a.rushedWrongRate)
      .slice(0, 5)
      .map((s) => ({ skillCode: s.skillCode, skillLabel: s.skillLabel, triedWrong: s.triedWrong, rushedWrongCount: s.rushedWrongCount })),
    avgActiveMsOverall: bundle.headline.avgActiveMs,
    examScoreTrend: (bundle.exam?.scoreTrend ?? []).map((e) => ({ totalScaled: e.totalScaled, completedAt: e.completedAt })),
    recentInsights: insights.map((i) => i.text),
    chatExcerpts,
    questionDetails,
  };
}

export async function analyzeStats(): Promise<{ analysis: Analysis } | { error: string }> {
  const profileId = await requireProfileId();
  if (!hintsConfigured()) {
    return { error: "AI analysis isn't configured — set OPENROUTER_API_KEY to enable it." };
  }

  const [bundle, chatExcerpts, questionDetails] = await Promise.all([
    loadStatsBundle(profileId),
    loadChatExcerpts(profileId),
    loadQuestionDetails(profileId),
  ]);
  if (bundle.practice === null && bundle.exam === null && bundle.pacing === null) {
    return { error: "Complete a few practice questions first — there's nothing to analyze yet." };
  }

  const { system, prompt } = buildRecommendationPrompt(toStatsSummaryInput(bundle, chatExcerpts, questionDetails));

  try {
    const { object } = await generateObject({ model: getAnalysisModel(), schema: AnalysisSchema, system, prompt });
    return { analysis: object };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Analysis failed — try again." };
  }
}
