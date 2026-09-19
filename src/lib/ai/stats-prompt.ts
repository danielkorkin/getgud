// Server-only. Builds the prompt for the one-shot "analyze my performance"
// call (src/actions/stats.ts). Mirrors coach-prompt.ts's shape: pure, no
// I/O, typed input in, prompt out. Only ever fed an already-aggregated
// summary (a few dozen numbers/strings), never raw Attempt rows — the
// aggregation in src/lib/stats/aggregate.ts already collapsed a profile's
// entire history before this point, so the prompt stays small regardless
// of how much history exists.
import "server-only";

export interface StatsSummaryInput {
  overallAccuracy: number;
  totalGraded: number;
  bySkill: {
    skillCode: string;
    skillLabel: string;
    domainCode: string;
    sectionCode: "RW" | "MATH";
    correct: number;
    graded: number;
  }[];
  byDifficulty: { difficulty: "E" | "M" | "H"; correct: number; graded: number }[];
  hintImpact: { hints: "0" | "1" | "2+"; correct: number; graded: number }[];
  markForReview: { marked: boolean; correct: number; graded: number }[];
  calculatorUsage: { used: boolean; correct: number; graded: number }[];
  referenceSheetUsage: { used: boolean; correct: number; graded: number }[];
  byTimeOfDay: { bucket: string; correct: number; graded: number }[];
  trend: { deltaPct: number; firstRate: number; lastRate: number } | null;
  avgActiveMsOverall: number;
  examScoreTrend: { totalScaled: number; completedAt: string }[];
  recentInsights: string[];
  /** Excerpts from past post-answer coach chats — see chat-history.ts. Free
   *  text, so the model (not a rule) is what can actually notice a
   *  recurring conceptual trouble spot across them. */
  chatExcerpts: { skillLabel: string; domainLabel: string; isCorrect: boolean | null; excerpt: string }[];
}

const SYSTEM_RULES = [
  "You are an SAT/PSAT tutor analyzing a student's full practice history to write a short performance summary and recommend targeted practice sets.",
  "Base every claim strictly on the data given — never invent a skill, score, or number not present in it.",
  "The summary must be 2-4 plain-text sentences: no markdown, no bullet lists, no LaTeX.",
  "Recommend 1-3 practice sets, each targeting skills where the data shows real weakness (lower accuracy, and reasonable sample size) — do not recommend a skill with fewer than 3 graded questions.",
  "Each recommended set's skillCodes must come only from the skill codes listed in the data below — never invent a code.",
  "The summary isn't limited to skill accuracy — if a behavioral pattern (calculator/reference-sheet usage, marking questions for review, time of day, or a recent trend) is the most notable signal in the data, lead with that instead of a generic accuracy restatement.",
  "If past coach-chat excerpts are provided, read them for recurring conceptual trouble — the same kind of confusion or misunderstanding showing up across more than one conversation, not a one-off question. List each such pattern as a short phrase (under 15 words) naming the specific confusion, e.g. \"mixes up correlation and causation in scatterplot questions\" — not a restatement of an accuracy number. Return an empty list if the excerpts don't show a repeated pattern, or if none are provided.",
];

function formatPct(correct: number, graded: number): string {
  return graded > 0 ? `${Math.round((correct / graded) * 100)}%` : "n/a";
}

export function buildRecommendationPrompt(input: StatsSummaryInput): { system: string; prompt: string } {
  const system = SYSTEM_RULES.join(" ");

  const skillLines = input.bySkill
    .map((s) => `- ${s.skillCode} (${s.skillLabel}, ${s.sectionCode}): ${formatPct(s.correct, s.graded)} (${s.correct}/${s.graded})`)
    .join("\n");

  const difficultyLines = input.byDifficulty
    .map((d) => `- ${d.difficulty}: ${formatPct(d.correct, d.graded)} (${d.correct}/${d.graded})`)
    .join("\n");

  const hintLines = input.hintImpact
    .map((h) => `- ${h.hints} hints used: ${formatPct(h.correct, h.graded)} (${h.correct}/${h.graded})`)
    .join("\n");

  const markForReviewLines = input.markForReview
    .map((m) => `- ${m.marked ? "Marked for review" : "Not marked"}: ${formatPct(m.correct, m.graded)} (${m.correct}/${m.graded})`)
    .join("\n");

  const calculatorLines = input.calculatorUsage
    .map((c) => `- Calculator ${c.used ? "opened" : "closed"} (Math only): ${formatPct(c.correct, c.graded)} (${c.correct}/${c.graded})`)
    .join("\n");

  const referenceSheetLines = input.referenceSheetUsage
    .map((r) => `- Reference sheet ${r.used ? "opened" : "closed"} (Math only): ${formatPct(r.correct, r.graded)} (${r.correct}/${r.graded})`)
    .join("\n");

  const timeOfDayLines = input.byTimeOfDay
    .map((t) => `- ${t.bucket}: ${formatPct(t.correct, t.graded)} (${t.correct}/${t.graded})`)
    .join("\n");

  const trendLine = input.trend
    ? `Accuracy went from ${Math.round(input.trend.firstRate * 100)}% early on to ${Math.round(input.trend.lastRate * 100)}% most recently.`
    : "(not enough history yet to show a trend)";

  const examLines =
    input.examScoreTrend.length > 0
      ? input.examScoreTrend.map((e) => `- ${e.completedAt.slice(0, 10)}: ${e.totalScaled}/1600`).join("\n")
      : "(no completed practice tests yet)";

  const insightLines = input.recentInsights.length > 0 ? input.recentInsights.map((t) => `- ${t}`).join("\n") : "(none)";

  const chatLines =
    input.chatExcerpts.length > 0
      ? input.chatExcerpts
          .map(
            (c, i) =>
              `Conversation ${i + 1} (${c.skillLabel}, ${c.domainLabel}, ${c.isCorrect === true ? "answered correctly" : c.isCorrect === false ? "answered incorrectly" : "ungraded"}):\n${c.excerpt}`,
          )
          .join("\n\n")
      : "(no past coach conversations)";

  const prompt = [
    `Overall practice accuracy: ${Math.round(input.overallAccuracy * 100)}% across ${input.totalGraded} graded questions.`,
    `Average time per question: ${Math.round(input.avgActiveMsOverall / 1000)}s.`,
    "\nAccuracy by skill (skill code, label, section: accuracy):",
    skillLines || "(not enough data yet)",
    "\nAccuracy by difficulty:",
    difficultyLines,
    "\nAccuracy by hint usage:",
    hintLines,
    "\nAccuracy trend over time:",
    trendLine,
    "\nAccuracy by marked-for-review status:",
    markForReviewLines,
    "\nAccuracy by calculator usage:",
    calculatorLines,
    "\nAccuracy by reference-sheet usage:",
    referenceSheetLines,
    "\nAccuracy by time of day practiced:",
    timeOfDayLines,
    "\nPractice test score history (out of 1600):",
    examLines,
    "\nAlready-computed observations:",
    insightLines,
    "\nExcerpts from past post-answer coach conversations (most recent first):",
    chatLines,
  ].join("\n");

  return { system, prompt };
}
