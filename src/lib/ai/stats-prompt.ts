// Server-only. Builds the prompt for the one-shot "analyze my performance"
// call (src/actions/stats.ts). Mirrors coach-prompt.ts's shape: pure, no
// I/O, typed input in, prompt out. Fed two kinds of input: an
// already-aggregated numeric summary (a few dozen numbers/strings, from
// src/lib/stats/aggregate.ts, which stays small regardless of history
// length) plus a bounded, truncated sample of real question content
// (src/lib/stats/question-details.ts) — passage/stem/choices text, not raw
// Attempt rows — so the model can name content-level patterns (a passage
// genre/era, a specific trap-answer type) that no amount of skill-code
// accuracy aggregation can surface on its own.
import "server-only";

import type { QuestionDetails } from "@/lib/stats/question-details";

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
  /** Combined across practice sets and practice tests — a self-flagged
   *  question is worth trusting or not regardless of which mode it came
   *  from. See `PacingStats` in aggregate.ts. */
  markForReview: { marked: boolean; correct: number; graded: number }[];
  calculatorUsage: { used: boolean; correct: number; graded: number }[];
  referenceSheetUsage: { used: boolean; correct: number; graded: number }[];
  byTimeOfDay: { bucket: string; correct: number; graded: number }[];
  trend: { deltaPct: number; firstRate: number; lastRate: number } | null;
  /** Skills the student answers correctly, but notably slower than their own
   *  normal pace for that section+difficulty — a "knows it, but it costs
   *  time" signal distinct from accuracy. See slowCorrectRate in
   *  aggregate.ts. */
  pacingConcerns: { skillCode: string; skillLabel: string; correctGraded: number; slowCorrectCount: number }[];
  /** The mirror image: wrong answers that came in well under pace — a
   *  carelessness signal rather than a knowledge gap. */
  rushedMistakes: { skillCode: string; skillLabel: string; triedWrong: number; rushedWrongCount: number }[];
  avgActiveMsOverall: number;
  examScoreTrend: { totalScaled: number; completedAt: string }[];
  recentInsights: string[];
  /** Excerpts from past post-answer coach chats — see chat-history.ts. Free
   *  text, so the model (not a rule) is what can actually notice a
   *  recurring conceptual trouble spot across them. */
  chatExcerpts: { skillLabel: string; domainLabel: string; isCorrect: boolean | null; excerpt: string }[];
  /** Actual recent questions (passage/stem/choices/answers), not just facet
   *  codes — see question-details.ts. Lets the model spot a content-level
   *  pattern (a recurring trap-answer type, phrasing, or question format) a
   *  skill-code accuracy breakdown can't show on its own. */
  questionDetails: QuestionDetails;
}

const SYSTEM_RULES = [
  "You are an SAT/PSAT tutor analyzing a student's full practice history to write a short performance summary and recommend targeted practice sets.",
  "Base every claim strictly on the data given — never invent a skill, score, number, passage detail, or question not present in it.",
  "The summary must be 2-4 plain-text sentences: no markdown, no bullet lists, no LaTeX.",

  // Precision mandate — the single most important instruction, stated
  // up front and reinforced by every rule below it. Written the way it is
  // (naming the exact banned phrasing) because a generic tutoring model
  // defaults to exactly these restatements unless explicitly told not to.
  "Precision is the whole point of this analysis: every claim, in the summary and in troubleSpots alike, must be specific enough that the student would immediately recognize which exact questions you mean. Never write a vague, generic restatement of an accuracy number — banned phrasing includes things like \"needs to work on reading comprehension,\" \"should practice algebra more,\" \"struggles with grammar rules,\" or \"could improve pacing.\" Instead name the precise skill AND, whenever the question content supports it, the precise kind of question: the passage's genre/era/style, the specific trap-answer pattern, or the specific mathematical structure involved.",

  "Recommend 1-3 practice sets, each targeting skills where the data shows real weakness (lower accuracy) or a pacing concern (correct but notably slow, or wrong and notably rushed) with reasonable sample size — do not recommend a skill with fewer than 3 graded questions.",
  "Each recommended set's skillCodes must come only from the skill codes listed in the data below — never invent a code. Its rationale field must name the specific pattern driving the recommendation (per the precision mandate above), not a generic \"improve your accuracy in X\" line.",
  "The summary isn't limited to skill accuracy — if a behavioral pattern (calculator/reference-sheet usage, marking questions for review, time of day, or a recent trend) is the most notable signal in the data, lead with that instead of a generic accuracy restatement.",

  // Content-pattern detection — this is what the raw question text below is
  // *for*. Spelled out with concrete example categories (matching what a
  // student would actually call "poems" or "old English") because a model
  // told only "look for patterns" tends to default back to skill codes,
  // which is exactly the gap this data was added to close.
  "Below the aggregated numbers, actual recent questions are included verbatim: passage text, the question stem, every answer choice, the student's own answer, the correct answer, and — for wrong answers — the official rationale. Read these directly; they exist because the SAT's own skill/domain codes (e.g. \"Craft and Structure\") describe *what skill* is being tested, never *what kind of passage or problem* it is, so a real content pattern is only visible by reading the text itself.",
  "For Reading & Writing misses specifically, actively check whether the passages share a genre, era, or prose style you can identify from the wording itself — for example: pre-20th-century literary prose or poetry, recognizable by inverted syntax, archaic or unusually formal vocabulary, or verse line-breaks (what a student typically calls \"old English\" even when it's really 18th/19th-century English rather than literally Old English); primary-source historical, political, or legal documents; dense scientific or research-summary writing; satirical or ironic tone; or a dual-passage synthesis format. If two or more missed passages clearly share such a trait, name it explicitly and concretely — e.g. \"loses accuracy on pre-1900 literary passages with inverted sentence structure\" — rather than only citing the domain code.",
  "For Math misses, likewise check whether the stems/choices share a problem structure beyond just difficulty or domain — e.g. multi-step word problems with real-world framing, systems of equations, a data table or graph described in the stem, unit conversion, a particular function notation, or a geometry setup — and name that structure specifically when it recurs.",
  "When a wrong answer's official rationale is included, use it to identify the specific reasoning error, not just that the student got it wrong — e.g. picked a choice that restates a supporting detail instead of the passage's main claim, picked a choice that is factually true but doesn't answer what was asked, or made a specific algebraic misstep. Only claim a reasoning-trap type recurs if you see the same type across more than one of the shown rationales.",
  "Use the sample of correctly-answered questions as a control, not just padding: if the student handles the same genre/era or skill correctly elsewhere in the sample, don't claim a genre/era weakness — narrow the claim to what's actually different about the missed ones instead (a specific sub-skill, difficulty, or trap type).",
  "Never report a content pattern — genre, era, trap type, or math structure — unless it actually recurs across more than one of the shown questions; a single missed question is never a pattern, no matter how notable it looks.",

  "If past coach-chat excerpts are provided, read them for recurring conceptual trouble — the same kind of confusion or misunderstanding showing up across more than one conversation, not a one-off question.",
  "troubleSpots should combine BOTH sources above: recurring conceptual trouble from past coach chats, and recurring content patterns (genre/era/style, trap-answer type, math structure) from the raw question examples. Each entry is one specific, concrete sentence (not a phrase) naming the pattern precisely enough to picture the exact questions it describes — e.g. \"Mixes up correlation and causation in scatterplot questions\" or \"Consistently picks the choice that restates a supporting detail instead of the passage's main claim in 18th/19th-century literary excerpts.\" Return an empty list only if neither source shows any repeated pattern.",

  "Pacing concerns and rushed mistakes are real weaknesses even on skills with fine accuracy — a skill the student gets right but consistently too slowly is worth a timed-drilling recommendation, and a skill where wrong answers come in unusually fast is worth flagging as a carelessness pattern, not a knowledge gap.",
];

function formatPct(correct: number, graded: number): string {
  return graded > 0 ? `${Math.round((correct / graded) * 100)}%` : "n/a";
}

function formatQuestionDetail(q: QuestionDetails["wrong"][number], index: number): string {
  return [
    `Question ${index + 1} — ${q.isCorrect ? "CORRECT" : "WRONG"} (${q.sectionCode}, ${q.skillLabel} / ${q.domainLabel}, difficulty ${q.difficulty}):`,
    q.stimulus ? `Passage: ${q.stimulus}` : null,
    `Prompt: ${q.stem}`,
    q.options ? `Choices:\n${q.options.join("\n")}` : null,
    `Student answered: ${q.studentAnswer}. Correct answer: ${q.correctAnswer}.`,
    q.rationale ? `Official explanation: ${q.rationale}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
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

  const pacingLines =
    input.pacingConcerns.length > 0
      ? input.pacingConcerns
          .map((p) => `- ${p.skillCode} (${p.skillLabel}): ${p.slowCorrectCount}/${p.correctGraded} correct answers ran well over normal pace`)
          .join("\n")
      : "(none)";

  const rushedLines =
    input.rushedMistakes.length > 0
      ? input.rushedMistakes
          .map((r) => `- ${r.skillCode} (${r.skillLabel}): ${r.rushedWrongCount}/${r.triedWrong} wrong answers came unusually fast`)
          .join("\n")
      : "(none)";

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

  const wrongQuestionLines =
    input.questionDetails.wrong.length > 0
      ? input.questionDetails.wrong.map((q, i) => formatQuestionDetail(q, i)).join("\n\n")
      : "(no wrong answers recorded yet)";

  const correctQuestionLines =
    input.questionDetails.correct.length > 0
      ? input.questionDetails.correct.map((q, i) => formatQuestionDetail(q, i)).join("\n\n")
      : "(none)";

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
    "\nAccuracy by marked-for-review status (practice sets and practice tests combined):",
    markForReviewLines,
    "\nAccuracy by calculator usage:",
    calculatorLines,
    "\nAccuracy by reference-sheet usage:",
    referenceSheetLines,
    "\nAccuracy by time of day practiced:",
    timeOfDayLines,
    "\nPacing concerns (correct but notably slower than this student's normal pace):",
    pacingLines,
    "\nRushed mistakes (wrong, but notably faster than normal pace):",
    rushedLines,
    "\nPractice test score history (out of 1600):",
    examLines,
    "\nAlready-computed observations:",
    insightLines,
    "\nExcerpts from past post-answer coach conversations (most recent first):",
    chatLines,
    "\nRecent questions answered WRONG, with full passage/choice content and (where available) the official rationale — read these directly for genre/era/style and trap-answer patterns, not just the skill code:",
    wrongQuestionLines,
    "\nA sample of recent questions answered CORRECTLY, for contrast (use to rule out a genre/skill weakness the student actually handles fine elsewhere):",
    correctQuestionLines,
  ].join("\n");

  return { system, prompt };
}
