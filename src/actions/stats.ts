"use server";

import { generateObject } from "ai";
import { requireProfileId } from "@/lib/profile";
import { hintsConfigured, getAnalysisModel } from "@/lib/ai/hint-provider";
import { buildRecommendationPrompt, type StatsSummaryInput } from "@/lib/ai/stats-prompt";
import { AnalysisSchema, type Analysis } from "@/lib/ai/stats-schema";
import { computeInsights } from "@/lib/stats/insights";
import { loadStatsBundle } from "@/lib/stats/load";
import { loadChatExcerpts, type ChatExcerpt } from "@/lib/stats/chat-history";
import type { StatsBundle } from "@/lib/stats/aggregate";

function toStatsSummaryInput(bundle: StatsBundle, chatExcerpts: ChatExcerpt[]): StatsSummaryInput {
  const insights = computeInsights(bundle.practice, bundle.exam);
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
    markForReview: bundle.practice?.markForReview ?? [],
    calculatorUsage: bundle.practice?.calculatorUsage ?? [],
    referenceSheetUsage: bundle.practice?.referenceSheetUsage ?? [],
    byTimeOfDay: bundle.practice?.byTimeOfDay ?? [],
    trend: bundle.practice?.trend ?? null,
    avgActiveMsOverall: bundle.headline.avgActiveMs,
    examScoreTrend: (bundle.exam?.scoreTrend ?? []).map((e) => ({ totalScaled: e.totalScaled, completedAt: e.completedAt })),
    recentInsights: insights.map((i) => i.text),
    chatExcerpts,
  };
}

export async function analyzeStats(): Promise<{ analysis: Analysis } | { error: string }> {
  const profileId = await requireProfileId();
  if (!hintsConfigured()) {
    return { error: "AI analysis isn't configured — set OPENROUTER_API_KEY to enable it." };
  }

  const [bundle, chatExcerpts] = await Promise.all([loadStatsBundle(profileId), loadChatExcerpts(profileId)]);
  if (bundle.practice === null && bundle.exam === null) {
    return { error: "Complete a few practice questions first — there's nothing to analyze yet." };
  }

  const { system, prompt } = buildRecommendationPrompt(toStatsSummaryInput(bundle, chatExcerpts));

  try {
    const { object } = await generateObject({ model: getAnalysisModel(), schema: AnalysisSchema, system, prompt });
    return { analysis: object };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Analysis failed — try again." };
  }
}
