"use client";

import Link from "next/link";
import { PlusIcon, ExamIcon, ChartLineIcon } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stats/stat-card";
import { InsightList } from "@/components/stats/insight-list";
import { AccuracyTrendChart } from "@/components/stats/accuracy-trend-chart";
import { SkillProgressList } from "@/components/stats/skill-progress-list";
import { RateBarChart, type RateBarDatum } from "@/components/stats/rate-bar-chart";
import { DifficultyBarChart } from "@/components/stats/difficulty-bar-chart";
import { StatTilePair } from "@/components/stats/stat-tile-pair";
import { SlowCorrectTable } from "@/components/stats/slow-correct-table";
import { VolumeHeatmap } from "@/components/stats/volume-heatmap";
import { ExamScoreChart } from "@/components/stats/exam-score-chart";
import { AnalysisPanel } from "@/components/stats/analysis-panel";
import { formatDuration } from "@/lib/stats/format";
import type { DomainRow, Insight, StatsBundle } from "@/lib/stats/aggregate";

function domainData(domains: DomainRow[], sectionCode: "RW" | "MATH"): RateBarDatum[] {
  return domains
    .filter((d) => d.sectionCode === sectionCode)
    .map((d) => ({ key: d.domainCode, label: d.domainLabel, rate: d.rate, graded: d.graded }));
}

export function StatsClient({ bundle, insights }: { bundle: StatsBundle; insights: Insight[] }) {
  if (!bundle.practice && !bundle.exam && !bundle.pacing) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartLineIcon />
          </EmptyMedia>
          <EmptyTitle>No practice data yet</EmptyTitle>
          <EmptyDescription>Answer a few questions in a practice set or test to see your stats here.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/new" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            New practice set
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  // Pacing insights (pacing-risk / rushed-mistakes are dynamic-id, mark-for-review
  // is static) are combined across modes — see `PacingStats` in aggregate.ts —
  // so they get their own mode-agnostic section instead of either tab's list.
  const isPacingInsight = (i: Insight) => i.id.startsWith("pacing-risk") || i.id.startsWith("rushed-mistakes") || i.id === "mark-for-review";
  const practiceInsights = insights.filter((i) => i.id !== "exam-trend" && !isPacingInsight(i));
  const examInsights = insights.filter((i) => i.id === "exam-trend");
  const pacingInsights = insights.filter(isPacingInsight);
  const p = bundle.practice;
  const pacing = bundle.pacing;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Questions answered" value={String(bundle.headline.totalQuestionsAnswered)} />
        <StatCard
          label="Overall accuracy"
          value={bundle.headline.overallAccuracy != null ? `${Math.round(bundle.headline.overallAccuracy * 100)}%` : "—"}
        />
        <StatCard label="Avg. time / question" value={formatDuration(bundle.headline.avgActiveMs)} />
        <StatCard label="Current streak" value={`${bundle.headline.currentStreakDays}d`} />
        <StatCard
          label="Latest test score"
          value={bundle.headline.latestExamTotalScaled != null ? `${bundle.headline.latestExamTotalScaled}/1600` : "—"}
        />
      </div>

      {pacing && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-medium tracking-tight">Pacing</h2>
            <p className="text-sm text-muted-foreground">
              Combined across practice sets and practice tests — the questions worth another look, regardless of
              where you saw them.
            </p>
          </div>
          <InsightList insights={pacingInsights} />
          <StatTilePair
            a={{ label: "Not marked for review", rate: pacing.markForReview[0].rate, graded: pacing.markForReview[0].graded }}
            b={{ label: "Marked for review", rate: pacing.markForReview[1].rate, graded: pacing.markForReview[1].graded }}
          />
          <RateBarChart
            title="Slow-but-correct rate by domain"
            description="Share of correct answers in each domain that ran well over your normal pace for that difficulty."
            data={pacing.byDomain.map((d) => ({ key: d.domainCode, label: d.domainLabel, rate: d.slowCorrectRate, graded: d.correctGraded }))}
            color="var(--chart-2)"
          />
          <SlowCorrectTable questions={pacing.slowCorrectQuestions} />
        </section>
      )}

      <Tabs defaultValue="practice">
        <TabsList>
          <TabsTrigger value="practice">Practice</TabsTrigger>
          <TabsTrigger value="tests">Practice Tests</TabsTrigger>
        </TabsList>

        <TabsContent value="practice" className="flex flex-col gap-4 pt-4">
          {p ? (
            <>
              <InsightList insights={practiceInsights} />
              <AccuracyTrendChart data={p.accuracyOverTime} />
              <SkillProgressList skills={p.bySkill} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <RateBarChart
                  title="Reading and Writing by domain"
                  data={domainData(p.byDomain, "RW")}
                  color="var(--chart-1)"
                  referenceValue={p.overallAccuracy}
                />
                <RateBarChart
                  title="Math by domain"
                  data={domainData(p.byDomain, "MATH")}
                  color="var(--chart-2)"
                  referenceValue={p.overallAccuracy}
                />
              </div>
              <DifficultyBarChart data={p.byDifficulty} referenceValue={p.overallAccuracy} />
              <StatTilePair
                a={{ label: "Multiple choice", rate: p.byQuestionType[0].rate, graded: p.byQuestionType[0].graded }}
                b={{ label: "Fill-in response", rate: p.byQuestionType[1].rate, graded: p.byQuestionType[1].graded }}
              />
              <StatTilePair
                a={{ label: "Not marked for review (sets only)", rate: p.markForReview[0].rate, graded: p.markForReview[0].graded }}
                b={{ label: "Marked for review (sets only)", rate: p.markForReview[1].rate, graded: p.markForReview[1].graded }}
              />
              <RateBarChart
                title="Accuracy by hint usage"
                data={p.hintImpact.map((h) => ({ key: h.hints, label: `${h.hints} hints`, rate: h.rate, graded: h.graded }))}
                color="var(--chart-3)"
                referenceValue={p.overallAccuracy}
              />
              <RateBarChart
                title="Accuracy by time spent"
                description="Quartiles of time-on-question — Q1 is your fastest 25%, Q4 your slowest."
                data={p.timeVsCorrectness.map((q) => ({
                  key: String(q.quartile),
                  label: `Q${q.quartile} (${formatDuration(q.medianMs)})`,
                  rate: q.rate,
                  graded: q.graded,
                }))}
                color="var(--chart-4)"
                referenceValue={p.overallAccuracy}
              />
              <RateBarChart
                title="Accuracy by time of day"
                description="When you tend to practice, and how accurate you are then."
                data={p.byTimeOfDay.map((t) => ({ key: t.bucket, label: t.bucket, rate: t.rate, graded: t.graded }))}
                color="var(--chart-5)"
                referenceValue={p.overallAccuracy}
              />
              <StatTilePair
                a={{ label: "No answer change", rate: p.secondGuessing[0].rate, graded: p.secondGuessing[0].graded }}
                b={{ label: "Changed answer", rate: p.secondGuessing[1].rate, graded: p.secondGuessing[1].graded }}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatTilePair
                  a={{ label: "Calculator: closed", rate: p.calculatorUsage[0].rate, graded: p.calculatorUsage[0].graded }}
                  b={{ label: "Calculator: opened", rate: p.calculatorUsage[1].rate, graded: p.calculatorUsage[1].graded }}
                />
                <StatTilePair
                  a={{ label: "Reference sheet: closed", rate: p.referenceSheetUsage[0].rate, graded: p.referenceSheetUsage[0].graded }}
                  b={{ label: "Reference sheet: opened", rate: p.referenceSheetUsage[1].rate, graded: p.referenceSheetUsage[1].graded }}
                />
              </div>
              <VolumeHeatmap volume={p.volume} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlusIcon />
                </EmptyMedia>
                <EmptyTitle>No practice sets yet</EmptyTitle>
                <EmptyDescription>Build a targeted drill set from the official question bank.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link href="/new" />} nativeButton={false}>
                  <PlusIcon data-icon="inline-start" />
                  New practice set
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="tests" className="flex flex-col gap-4 pt-4">
          {bundle.exam ? (
            <>
              <InsightList insights={examInsights} />
              <ExamScoreChart data={bundle.exam.scoreTrend} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ExamIcon />
                </EmptyMedia>
                <EmptyTitle>No completed practice tests yet</EmptyTitle>
                <EmptyDescription>Full-length, timed, and adaptive, just like the real SAT.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link href="/tests" />} nativeButton={false}>
                  <ExamIcon data-icon="inline-start" />
                  Practice tests
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </TabsContent>
      </Tabs>

      <AnalysisPanel />
    </div>
  );
}
