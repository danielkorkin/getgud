// Rule-based "message" layer on top of aggregate.ts — turns the numeric
// breakdowns into the handful of sentences worth surfacing. Every rule has
// an explicit minimum-sample guard so a single question never drives a
// claim (see the numbers inline — they're the plan's reviewed thresholds,
// not arbitrary).

import { formatDuration } from "@/lib/stats/format";
import { median, type ExamStats, type Insight, type PracticeStats } from "@/lib/stats/aggregate";

function pctLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function computeInsights(practice: PracticeStats | null, exam: ExamStats | null): Insight[] {
  const insights: Insight[] = [];

  if (practice) {
    // Weakest skill, at least 8 graded questions, at least 15pts below overall.
    const weak = practice.bySkill.find((s) => s.graded >= 8 && s.rate <= practice.overallAccuracy - 0.15);
    if (weak) {
      insights.push({
        id: "weak-skill",
        severity: "opportunity",
        text: `${weak.skillLabel} is your weakest skill at ${pctLabel(weak.rate)} — ${Math.round((practice.overallAccuracy - weak.rate) * 100)} points below your overall accuracy.`,
        targetSkillCode: weak.skillCode,
      });
    }

    // Hint-usage accuracy gap.
    const noHints = practice.hintImpact.find((h) => h.hints === "0");
    const heavyHints = practice.hintImpact.find((h) => h.hints === "2+");
    if (noHints && heavyHints && noHints.graded >= 5 && heavyHints.graded >= 5) {
      const gap = noHints.rate - heavyHints.rate;
      if (Math.abs(gap) >= 0.1) {
        insights.push({
          id: "hint-impact",
          severity: gap > 0 ? "notice" : "info",
          text:
            gap > 0
              ? `Your accuracy drops ${Math.round(gap * 100)} points on questions where you used 2 or more hints (${pctLabel(heavyHints.rate)} vs ${pctLabel(noHints.rate)} unaided) — try a full unaided pass first.`
              : `You actually do better on hint-heavy questions (${pctLabel(heavyHints.rate)} vs ${pctLabel(noHints.rate)} unaided) — hints seem to be helping, not masking gaps.`,
        });
      }
    }

    // Time-quartile accuracy, needs at least 20 graded overall.
    if (practice.totalGraded >= 20 && practice.timeVsCorrectness.length === 4) {
      const [q1, , , q4] = practice.timeVsCorrectness;
      const gap = q1.rate - q4.rate;
      if (Math.abs(gap) >= 0.1) {
        insights.push({
          id: "time-quartile",
          severity: "info",
          text:
            gap > 0
              ? `Your fastest questions (median ${formatDuration(q1.medianMs)}) are answered more accurately than your slowest (median ${formatDuration(q4.medianMs)}) — getting stuck seems to hurt more than rushing.`
              : `Your slowest questions (median ${formatDuration(q4.medianMs)}) are answered more accurately than your fastest (median ${formatDuration(q1.medianMs)}) — slowing down on hard ones is paying off.`,
        });
      }
    }

    // Difficulty cliff, E vs H.
    const easy = practice.byDifficulty.find((d) => d.difficulty === "E");
    const hard = practice.byDifficulty.find((d) => d.difficulty === "H");
    if (easy && hard && easy.graded >= 5 && hard.graded >= 5) {
      const gap = easy.rate - hard.rate;
      if (gap >= 0.15) {
        insights.push({
          id: "difficulty-cliff",
          severity: "opportunity",
          text: `You're ${Math.round(gap * 100)} points weaker on Hard questions than Easy — most of your missed points are concentrated there.`,
        });
      }
    }

    // Section imbalance.
    const rwDomains = practice.byDomain.filter((d) => d.sectionCode === "RW");
    const mathDomains = practice.byDomain.filter((d) => d.sectionCode === "MATH");
    const rwGraded = rwDomains.reduce((s, d) => s + d.graded, 0);
    const mathGraded = mathDomains.reduce((s, d) => s + d.graded, 0);
    if (rwGraded >= 10 && mathGraded >= 10) {
      const rwCorrect = rwDomains.reduce((s, d) => s + d.correct, 0);
      const mathCorrect = mathDomains.reduce((s, d) => s + d.correct, 0);
      const rwRate = rwCorrect / rwGraded;
      const mathRate = mathCorrect / mathGraded;
      const gap = Math.abs(rwRate - mathRate);
      if (gap >= 0.1) {
        const stronger = rwRate > mathRate ? "Reading and Writing" : "Math";
        const weaker = rwRate > mathRate ? "Math" : "Reading and Writing";
        const strongerRate = Math.max(rwRate, mathRate);
        const weakerRate = Math.min(rwRate, mathRate);
        insights.push({
          id: "section-imbalance",
          severity: "notice",
          text: `${stronger} accuracy (${pctLabel(strongerRate)}) leads ${weaker} (${pctLabel(weakerRate)}) by ${Math.round(gap * 100)} points.`,
        });
      }
    }

    // Reveal / give-up rate.
    if (practice.reveal.gradedCount >= 10) {
      const rate = practice.reveal.revealedCount / practice.reveal.gradedCount;
      if (rate >= 0.08) {
        insights.push({
          id: "reveal-rate",
          severity: "notice",
          text: `You revealed the answer on ${pctLabel(rate)} of questions instead of submitting a guess — a guess is free, a reveal always counts wrong.`,
        });
      }
    }

    // Second-guessing.
    const noChange = practice.secondGuessing.find((b) => !b.changed);
    const changed = practice.secondGuessing.find((b) => b.changed);
    if (noChange && changed && noChange.graded >= 5 && changed.graded >= 5) {
      const gap = changed.rate - noChange.rate;
      if (Math.abs(gap) >= 0.1) {
        insights.push({
          id: "second-guessing",
          severity: "info",
          text:
            gap > 0
              ? `Changing your answer helped more than it hurt: ${pctLabel(changed.rate)} accuracy after a change vs ${pctLabel(noChange.rate)} without.`
              : `Changing your answer tends to hurt: ${pctLabel(changed.rate)} accuracy after a change vs ${pctLabel(noChange.rate)} without — trust your first read more often.`,
        });
      }
    }

    // Domain slower-than-average.
    const overallMedianActive = median(practice.bySkill.flatMap((s) => Array(s.graded).fill(s.avgActiveMs)));
    const slowDomain = practice.bySkill.find(
      (s) => s.graded >= 8 && overallMedianActive > 0 && s.avgActiveMs >= overallMedianActive * 1.4,
    );
    if (slowDomain) {
      const pctSlower = Math.round((slowDomain.avgActiveMs / overallMedianActive - 1) * 100);
      insights.push({
        id: `slow-skill:${slowDomain.skillCode}`,
        severity: "info",
        text: `You spend ${pctSlower}% longer per question on ${slowDomain.skillLabel} than your average — that's likely costing you pace on test day.`,
        targetSkillCode: slowDomain.skillCode,
      });
    }

    // Accuracy trend, first bucket vs last bucket of accuracyOverTime.
    if (practice.trend && practice.trend.bucketCount >= 3) {
      const gap = practice.trend.deltaPct;
      if (Math.abs(gap) >= 10) {
        insights.push({
          id: "accuracy-trend",
          severity: gap > 0 ? "info" : "notice",
          text:
            gap > 0
              ? `Your accuracy is trending up: ${pctLabel(practice.trend.firstRate)} early on vs ${pctLabel(practice.trend.lastRate)} recently.`
              : `Your accuracy has slipped recently: ${pctLabel(practice.trend.firstRate)} early on vs ${pctLabel(practice.trend.lastRate)} now.`,
        });
      }
    }

    // Marked-for-review accuracy — is the instinct to flag a question
    // actually tracking with getting it wrong?
    const notMarked = practice.markForReview.find((b) => !b.marked);
    const marked = practice.markForReview.find((b) => b.marked);
    if (notMarked && marked && notMarked.graded >= 5 && marked.graded >= 5) {
      const gap = notMarked.rate - marked.rate;
      if (gap >= 0.15) {
        insights.push({
          id: "mark-for-review",
          severity: "opportunity",
          text: `Questions you marked for review were right only ${pctLabel(marked.rate)} of the time, vs ${pctLabel(notMarked.rate)} for the rest — that instinct is worth trusting; double-check flagged questions before submitting.`,
        });
      }
    }

    // Calculator usage on Math (Bluebook's calculator is Math-only).
    const calcUnused = practice.calculatorUsage.find((b) => !b.used);
    const calcUsed = practice.calculatorUsage.find((b) => b.used);
    if (calcUnused && calcUsed && calcUnused.graded >= 5 && calcUsed.graded >= 5) {
      const gap = calcUsed.rate - calcUnused.rate;
      if (Math.abs(gap) >= 0.15) {
        insights.push({
          id: "calculator-usage",
          severity: gap > 0 ? "opportunity" : "info",
          text:
            gap > 0
              ? `You're ${Math.round(gap * 100)} points more accurate on Math questions where you opened the calculator (${pctLabel(calcUsed.rate)} vs ${pctLabel(calcUnused.rate)}) — reach for it more often.`
              : `You're actually more accurate on Math questions where you skipped the calculator (${pctLabel(calcUnused.rate)} vs ${pctLabel(calcUsed.rate)}) — it may be slowing you down more than helping.`,
        });
      }
    }

    // Time of day — needs at least two buckets with real sample size to compare.
    const timeOfDayWithData = practice.byTimeOfDay.filter((b) => b.graded >= 5);
    if (timeOfDayWithData.length >= 2) {
      const best = timeOfDayWithData.reduce((a, b) => (b.rate > a.rate ? b : a));
      const worst = timeOfDayWithData.reduce((a, b) => (b.rate < a.rate ? b : a));
      if (best.bucket !== worst.bucket && best.rate - worst.rate >= 0.15) {
        insights.push({
          id: "time-of-day",
          severity: "info",
          text: `You're most accurate in the ${best.bucket.toLowerCase()} (${pctLabel(best.rate)}) and weakest in the ${worst.bucket.toLowerCase()} (${pctLabel(worst.rate)}) — worth scheduling practice (or the real test) accordingly.`,
        });
      }
    }

    // Streak, always shown if non-zero.
    if (practice.volume.currentStreakDays >= 2) {
      insights.push({
        id: "streak",
        severity: "info",
        text:
          practice.volume.currentStreakDays >= practice.volume.longestStreakDays
            ? `${practice.volume.currentStreakDays}-day streak — your longest yet.`
            : `${practice.volume.currentStreakDays}-day streak going (longest: ${practice.volume.longestStreakDays}).`,
      });
    }
  }

  if (exam && exam.scoreTrend.length >= 2) {
    const first = exam.scoreTrend[0];
    const latest = exam.scoreTrend[exam.scoreTrend.length - 1];
    const delta = latest.totalScaled - first.totalScaled;
    if (delta !== 0) {
      insights.push({
        id: "exam-trend",
        severity: delta > 0 ? "info" : "notice",
        text:
          delta > 0
            ? `Your total score is up ${delta} points since your first practice test.`
            : `Your total score is down ${Math.abs(delta)} points since your first practice test.`,
      });
    }
  }

  return insights;
}
