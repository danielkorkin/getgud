// Pulls a bounded sample of actual past questions — passage/stem, choices,
// the student's own answer, and the correct answer — for the AI performance
// analysis to read directly, alongside the aggregated numbers in
// aggregate.ts. Accuracy-by-skill-code numbers can't show a content-level
// pattern (a recurring trap-answer type, a specific phrasing, a question
// format) the way seeing the actual missed questions can. Kept separate
// from load.ts/aggregate.ts for the same reason chat-history.ts is: a
// different kind of data (real question text, not numeric facets) with its
// own token-budget concerns — only a bounded, truncated sample is read, so
// this stays small regardless of how much history a profile has.
import "server-only";

import { db } from "@/prisma/db";
import { domainLabel, skillLabel } from "@/lib/catalog";
import { toPlainText } from "@/lib/content/plain-text";
import type { AnswerOption } from "@/lib/grading";

export interface QuestionDetail {
  skillLabel: string;
  domainLabel: string;
  sectionCode: string;
  difficulty: string;
  isCorrect: boolean;
  stimulus: string | null;
  stem: string;
  options: string[] | null;
  studentAnswer: string;
  correctAnswer: string;
  submittedAt: string;
}

export interface QuestionDetails {
  wrong: QuestionDetail[];
  correct: QuestionDetail[];
}

// Wrong answers are the higher-value signal (that's where a content pattern
// actually helps), so they get the bigger budget; a handful of correct ones
// are included only for contrast against the same skill/format.
const MAX_WRONG = 15;
const MAX_CORRECT = 8;
// Kept short deliberately — this is a sample across many questions for
// pattern-spotting, not a full transcript of any one of them (the coach/hint
// prompts, which only ever handle a single question, don't truncate).
const STIMULUS_MAX_CHARS = 280;
const STEM_MAX_CHARS = 280;
const OPTION_MAX_CHARS = 120;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/** The most recent wrong answers (capped), plus a smaller sample of recent
 *  correct ones for contrast — each with real question content, not just
 *  facet codes. Combined across practice sets and practice tests, same
 *  reasoning as `PacingStats`: which specific past questions are worth
 *  reviewing doesn't depend on which mode produced them. */
export async function loadQuestionDetails(profileId: string): Promise<QuestionDetails> {
  const attempts = await db.orm.public.Attempt.where({ profileId })
    .select(
      "questionId",
      "sectionCode",
      "domainCode",
      "skillCode",
      "difficulty",
      "type",
      "status",
      "isCorrect",
      "gradable",
      "selectedLetter",
      "spResponse",
      "submittedAt",
      "answerRevealed",
    )
    .orderBy((a) => a.submittedAt.desc())
    .all();

  const graded = attempts.filter((a) => a.status === "answered" && a.gradable && a.isCorrect !== null && a.submittedAt);
  const wrongAttempts = graded.filter((a) => a.isCorrect === false).slice(0, MAX_WRONG);
  const correctAttempts = graded.filter((a) => a.isCorrect === true).slice(0, MAX_CORRECT);
  const chosen = [...wrongAttempts, ...correctAttempts];
  if (chosen.length === 0) return { wrong: [], correct: [] };

  const questionIds = [...new Set(chosen.map((a) => a.questionId))];
  const questions = await db.orm.public.Question.select("id", "stem", "stimulus", "answerOptions", "correctAnswer")
    .where((q) => q.id.in(questionIds))
    .all();
  const questionById = new Map(questions.map((q) => [q.id, q]));

  function toDetail(a: (typeof chosen)[number]): QuestionDetail | null {
    const question = questionById.get(a.questionId);
    if (!question) return null;
    const options = (question.answerOptions as AnswerOption[] | null) ?? null;
    return {
      skillLabel: skillLabel(a.skillCode),
      domainLabel: domainLabel(a.domainCode),
      sectionCode: a.sectionCode,
      difficulty: a.difficulty,
      isCorrect: a.isCorrect === true,
      stimulus: question.stimulus ? truncate(toPlainText(question.stimulus), STIMULUS_MAX_CHARS) : null,
      stem: truncate(toPlainText(question.stem), STEM_MAX_CHARS),
      options: options ? options.map((o) => `${o.letter}. ${truncate(toPlainText(o.content), OPTION_MAX_CHARS)}`) : null,
      studentAnswer: a.answerRevealed
        ? "(gave up, revealed answer)"
        : a.type === "mcq"
          ? (a.selectedLetter ?? "(no answer)")
          : (a.spResponse ?? "(no answer)"),
      correctAnswer: question.correctAnswer.length > 0 ? question.correctAnswer.join(" or ") : "(unpublished)",
      submittedAt: a.submittedAt!,
    };
  }

  return {
    wrong: wrongAttempts.map(toDetail).filter((d): d is QuestionDetail => d !== null),
    correct: correctAttempts.map(toDetail).filter((d): d is QuestionDetail => d !== null),
  };
}
