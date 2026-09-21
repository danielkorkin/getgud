// Pulls a bounded sample of actual past questions — passage/stem, choices,
// the student's own answer, the correct answer, and (for misses) the
// official rationale — for the AI performance analysis to read directly,
// alongside the aggregated numbers in aggregate.ts. Accuracy-by-skill-code
// numbers can't show a content-level pattern (a recurring passage genre or
// era, a specific trap-answer type, a question format) the way seeing the
// actual missed questions can — the SAT's own skill taxonomy (Craft and
// Structure, Information and Ideas, etc.) has no code at all for "this is a
// 19th-century poem with inverted syntax" or "this is a dual-passage
// synthesis question," so that kind of pattern is only visible to the model
// if it can read the passage text itself. Kept separate from
// load.ts/aggregate.ts for the same reason chat-history.ts is: a different
// kind of data (real question text, not numeric facets) with its own
// token-budget concerns — only a bounded, truncated sample is read, so this
// stays small regardless of how much history a profile has.
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
  /** Only populated for wrong answers — the official explanation of the
   *  correct choice, which is often where a recurring reasoning-trap type
   *  (extreme-language distractor, restates-a-detail-not-the-claim, etc.)
   *  is spelled out in the source material itself. Null for correct
   *  answers, which are only included for contrast in the first place. */
  rationale: string | null;
  submittedAt: string;
}

export interface QuestionDetails {
  wrong: QuestionDetail[];
  correct: QuestionDetail[];
}

// Wrong answers are the higher-value signal (that's where a content pattern
// actually helps), so they get the bigger budget; a smaller sample of
// correct ones is included for contrast — e.g. confirming that the student
// handles the same passage genre/era fine when the skill being tested
// differs, which narrows a pattern down to the actual point of failure.
const MAX_WRONG = 25;
const MAX_CORRECT = 12;
// Median stimulus length in this bank is ~490 chars and the 90th percentile
// is ~1,000 (a handful of outliers run tens of thousands of chars long,
// e.g. dual-passage/table-heavy items) — the original 280-char cap here cut
// off most passages before any genre/era/style signal even appeared. 900
// covers the large majority of passages close to whole, while still
// bounding the rare multi-thousand-char outlier.
const STIMULUS_MAX_CHARS = 900;
const STEM_MAX_CHARS = 400;
const OPTION_MAX_CHARS = 200;
const RATIONALE_MAX_CHARS = 300;

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
  const questions = await db.orm.public.Question.select("id", "stem", "stimulus", "answerOptions", "correctAnswer", "rationale")
    .where((q) => q.id.in(questionIds))
    .all();
  const questionById = new Map(questions.map((q) => [q.id, q]));

  function toDetail(a: (typeof chosen)[number]): QuestionDetail | null {
    const question = questionById.get(a.questionId);
    if (!question) return null;
    const options = (question.answerOptions as AnswerOption[] | null) ?? null;
    const isCorrect = a.isCorrect === true;
    return {
      skillLabel: skillLabel(a.skillCode),
      domainLabel: domainLabel(a.domainCode),
      sectionCode: a.sectionCode,
      difficulty: a.difficulty,
      isCorrect,
      stimulus: question.stimulus ? truncate(toPlainText(question.stimulus), STIMULUS_MAX_CHARS) : null,
      stem: truncate(toPlainText(question.stem), STEM_MAX_CHARS),
      options: options ? options.map((o) => `${o.letter}. ${truncate(toPlainText(o.content), OPTION_MAX_CHARS)}`) : null,
      studentAnswer: a.answerRevealed
        ? "(gave up, revealed answer)"
        : a.type === "mcq"
          ? (a.selectedLetter ?? "(no answer)")
          : (a.spResponse ?? "(no answer)"),
      correctAnswer: question.correctAnswer.length > 0 ? question.correctAnswer.join(" or ") : "(unpublished)",
      rationale: !isCorrect && question.rationale ? truncate(toPlainText(question.rationale), RATIONALE_MAX_CHARS) : null,
      submittedAt: a.submittedAt!,
    };
  }

  return {
    wrong: wrongAttempts.map(toDetail).filter((d): d is QuestionDetail => d !== null),
    correct: correctAttempts.map(toDetail).filter((d): d is QuestionDetail => d !== null),
  };
}
