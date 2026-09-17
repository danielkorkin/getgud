"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/prisma/db";
import { requireProfileId } from "@/lib/profile";
import { getOwnedItem } from "@/lib/access";
import { renderContentField } from "@/lib/content/render";
import { gradeAnswer, normalizeSprResponse, type AnswerOption } from "@/lib/grading";
import { toJsonValue } from "@/lib/json";
import type { CoachMessage } from "@/lib/ai/coach-prompt";

export interface RenderedOption {
  id: string;
  letter: string;
  html: string;
}

export interface RenderedItemResult {
  set: { id: string; name: string; questionCount: number; currentIndex: number };
  item: {
    /** Also the Attempt's id, by convention — a 1:1 relationship, so `Attempt.id === PracticeSetItem.id`. */
    id: string;
    questionId: string;
    position: number;
    type: string;
    sectionCode: string;
    domainCode: string;
    skillCode: string;
    difficulty: string;
    scoreBand: number | null;
    gradable: boolean;
  };
  content: {
    stimulusHtml: string | null;
    stemHtml: string;
    options: RenderedOption[] | null;
  };
  attempt: {
    status: string;
    selectedOptionId: string | null;
    selectedLetter: string | null;
    spResponse: string | null;
    isCorrect: boolean | null;
    markedForReview: boolean;
    eliminatedOptionIds: readonly string[];
    hintsUsed: number;
    maxHintLevel: number;
    /** Every hint already unlocked for this attempt, low-to-high — restores the coach's hint ladder on reload with no re-fetch. */
    usedHints: { level: number; content: string }[];
    answerRevealed: boolean;
    notes: string | null;
    highlights: unknown;
    calculatorOpened: boolean;
    referenceOpened: boolean;
    /** The coach's post-answer chat, in order — restores it exactly on revisit until "Clear chat". */
    chatMessages: CoachMessage[];
    /** Wall-clock time to answer (firstViewedAt -> submittedAt), server-recomputed — what the runner's header timer freezes at once answered. */
    totalMs: number;
  };
  feedback: RevealedFeedback | null;
}

export interface RevealedFeedback {
  rationaleHtml: string;
  correctOptionId: string | null;
  correctLetter: string | null;
  /** SPR only — every accepted literal form, e.g. ["14.5", "29/2"]. Empty for MCQ. */
  correctAnswer: readonly string[];
}

/**
 * Load (and lazily render) one question. `recordVisit` gates every
 * side effect that means "the user actually looked at this" — the
 * background prefetch of `position + 1` (see practice-runner.tsx) calls
 * this too, purely to warm the render cache, and must pass `false` so it
 * doesn't advance the resume pointer (`PracticeSet.currentIndex`) past
 * where the user really is, or mark a never-seen question as viewed
 * (`Attempt.visitCount`/`firstViewedAt`) — both of which would corrupt
 * the telemetry this app is built to capture.
 */
export async function getRenderedItem(
  setId: string,
  position: number,
  recordVisit = true,
): Promise<RenderedItemResult> {
  const { profileId, set, item, question } = await getOwnedItem(setId, position);
  const now = new Date().toISOString();

  const existing = await db.orm.public.Attempt.first({ id: item.id });
  const attemptRow = existing
    ? recordVisit
      ? await db.orm.public.Attempt.where({ id: item.id }).update({
          visitCount: existing.visitCount + 1,
          firstViewedAt: existing.firstViewedAt ?? now,
        })
      : existing
    : await db.orm.public.Attempt.create({
        id: item.id,
        itemId: item.id,
        setId,
        profileId,
        questionId: question.id,
        assessment: item.assessment,
        sectionCode: item.sectionCode,
        domainCode: item.domainCode,
        skillCode: item.skillCode,
        difficulty: item.difficulty,
        scoreBand: item.scoreBand,
        type: item.type,
        contentSource: question.contentSource,
        status: "unanswered",
        gradable: item.gradable,
        firstViewedAt: recordVisit ? now : null,
        visitCount: recordVisit ? 1 : 0,
      });
  // `.update()` types as possibly-null (a predicate might match zero rows);
  // it can't here — we just read `existing` inside the same request.
  const attempt = attemptRow!;

  if (recordVisit && set.currentIndex !== position) {
    await db.orm.public.PracticeSet.where({ id: setId }).update({ currentIndex: position });
  }

  const options = (question.answerOptions as AnswerOption[] | null)?.map((o) => ({
    id: o.id,
    letter: o.letter,
    html: renderContentField({ html: o.content, contentHash: question.contentHash, field: `option:${o.id}` }),
  })) ?? null;

  const answered = attempt.status === "answered";
  let feedback: RenderedItemResult["feedback"] = null;
  if (answered) {
    const correctOption = options?.find((o) => question.correctKeys.includes(o.id)) ?? null;
    feedback = {
      rationaleHtml: renderContentField({
        html: question.rationale,
        contentHash: question.contentHash,
        field: "rationale",
      }),
      correctOptionId: correctOption?.id ?? null,
      correctLetter: correctOption?.letter ?? null,
      correctAnswer: question.correctAnswer,
    };
  }

  // Every hint already unlocked for this attempt — restores the coach's hint
  // ladder on reload with zero AI calls. Skipped entirely when nothing has
  // been unlocked yet (the common case).
  let usedHints: RenderedItemResult["attempt"]["usedHints"] = [];
  if (attempt.maxHintLevel > 0) {
    const [attemptHints, questionHints] = await Promise.all([
      db.orm.public.AttemptHint.where({ attemptId: item.id }).all(),
      db.orm.public.QuestionHint.where({ questionId: question.id }).all(),
    ]);
    const contentByLevel = new Map(questionHints.map((h) => [h.level, h.content]));
    usedHints = attemptHints
      .map((h) => ({ level: h.level, content: contentByLevel.get(h.level) ?? "" }))
      .filter((h) => h.content)
      .sort((a, b) => a.level - b.level);
  }

  return {
    set: { id: set.id, name: set.name, questionCount: set.questionCount, currentIndex: position },
    item: {
      id: item.id,
      questionId: question.id,
      position: item.position,
      type: item.type,
      sectionCode: item.sectionCode,
      domainCode: item.domainCode,
      skillCode: item.skillCode,
      difficulty: item.difficulty,
      scoreBand: item.scoreBand,
      gradable: item.gradable,
    },
    content: {
      stimulusHtml: question.stimulus
        ? renderContentField({ html: question.stimulus, contentHash: question.contentHash, field: "stimulus" })
        : null,
      stemHtml: renderContentField({ html: question.stem, contentHash: question.contentHash, field: "stem" }),
      options,
    },
    attempt: {
      status: attempt.status,
      selectedOptionId: attempt.selectedOptionId,
      selectedLetter: attempt.selectedLetter,
      spResponse: attempt.spResponse,
      isCorrect: attempt.isCorrect,
      markedForReview: attempt.markedForReview,
      eliminatedOptionIds: attempt.eliminatedOptionIds,
      hintsUsed: attempt.hintsUsed,
      maxHintLevel: attempt.maxHintLevel,
      usedHints,
      answerRevealed: attempt.answerRevealed,
      notes: attempt.notes,
      highlights: attempt.highlights,
      calculatorOpened: attempt.calculatorOpened,
      referenceOpened: attempt.referenceOpened,
      chatMessages: (attempt.chatMessages as CoachMessage[] | null) ?? [],
      totalMs: attempt.totalMs,
    },
    feedback,
  };
}

/**
 * Records the same "actually viewed this" side effects as
 * `getRenderedItem(..., true)`, without re-rendering content — for when
 * the runner is about to display a position it already prefetched (with
 * `recordVisit: false`) and is reusing that cached render.
 */
export async function markVisited(setId: string, position: number): Promise<void> {
  const { set, item } = await getOwnedItem(setId, position);
  const now = new Date().toISOString();
  const existing = await db.orm.public.Attempt.first({ id: item.id });
  if (existing) {
    await db.orm.public.Attempt.where({ id: item.id }).update({
      visitCount: existing.visitCount + 1,
      firstViewedAt: existing.firstViewedAt ?? now,
    });
  }
  if (set.currentIndex !== position) {
    await db.orm.public.PracticeSet.where({ id: setId }).update({ currentIndex: position });
  }
}

export interface SubmitAnswerInput {
  selectedOptionId?: string;
  spResponse?: string;
  timeToFirstInputMs?: number;
}

export interface SubmitAnswerResult extends RevealedFeedback {
  isCorrect: boolean | null;
  gradable: boolean;
  /** Same value as `RenderedItemResult.attempt.totalMs` — lets the runner freeze its header timer at the instant of answering without a second fetch. */
  totalMs: number;
}

export async function submitAnswer(
  setId: string,
  position: number,
  input: SubmitAnswerInput,
): Promise<SubmitAnswerResult> {
  const { set, item, question } = await getOwnedItem(setId, position);
  const now = new Date().toISOString();

  const attempt = await db.orm.public.Attempt.first({ id: item.id });
  if (!attempt) throw new Error("View the question before submitting.");

  const options = question.answerOptions as AnswerOption[] | null;
  const correctOption = options?.find((o) => question.correctKeys.includes(o.id)) ?? null;

  // Idempotent: a question already answered in practice mode stays answered
  // — re-submitting (e.g. a duplicate client request) just returns the
  // existing feedback rather than re-grading or double-counting rollups.
  if (attempt.status !== "answered") {
    const { isCorrect, gradable } = gradeAnswer({
      type: item.type as "mcq" | "spr",
      correctKeys: question.correctKeys,
      selectedOptionId: input.selectedOptionId ?? null,
      spResponse: input.spResponse ?? null,
    });
    const selectedOption = options?.find((o) => o.id === input.selectedOptionId);
    // Recomputed from real timestamps rather than accumulated from client
    // deltas — robust against a tab left open, refreshed, or backgrounded
    // mid-question. Only meaningful once (first submission); a lingering
    // firstViewedAt gap after that would double-count on a hypothetical
    // re-submit, but the idempotency guard above already prevents that.
    const totalMs = attempt.firstViewedAt
      ? Math.max(0, new Date(now).getTime() - new Date(attempt.firstViewedAt).getTime())
      : attempt.totalMs;

    await db.orm.public.Attempt.where({ id: item.id }).update({
      status: "answered",
      selectedOptionId: input.selectedOptionId ?? null,
      selectedLetter: selectedOption?.letter ?? null,
      spResponse: input.spResponse ?? null,
      spNormalized: input.spResponse ? normalizeSprResponse(input.spResponse) : null,
      isCorrect,
      gradable,
      submittedAt: now,
      totalMs,
      timeToFirstInputMs: input.timeToFirstInputMs ?? attempt.timeToFirstInputMs,
    });

    await db.orm.public.PracticeSet.where({ id: setId }).update({
      gradedCount: set.gradedCount + 1,
      correctCount: isCorrect ? set.correctCount + 1 : set.correctCount,
    });
  }

  const finalAttempt = await db.orm.public.Attempt.first({ id: item.id });
  return {
    isCorrect: finalAttempt!.isCorrect,
    gradable: finalAttempt!.gradable,
    totalMs: finalAttempt!.totalMs,
    rationaleHtml: renderContentField({ html: question.rationale, contentHash: question.contentHash, field: "rationale" }),
    correctOptionId: correctOption?.id ?? null,
    correctLetter: correctOption?.letter ?? null,
    correctAnswer: question.correctAnswer,
  };
}

/**
 * "Give up and show me the answer" — scores the question wrong (this is a
 * concession, not a correct submission) and marks `answerRevealed` so the nav
 * and results page can distinguish it from a genuine wrong attempt. A plain
 * Server Action, not an AI call — works with no OPENROUTER_API_KEY.
 * `getOwnedItem` with no policy argument closes this to exam-mode sets, same
 * as `submitAnswer`.
 */
export async function revealAnswer(setId: string, position: number): Promise<SubmitAnswerResult> {
  const { set, item, question } = await getOwnedItem(setId, position);
  if (!item.gradable) throw new Error("This question has no published answer to reveal.");
  const now = new Date().toISOString();

  const attempt = await db.orm.public.Attempt.first({ id: item.id });
  if (!attempt) throw new Error("View the question before revealing the answer.");

  const options = question.answerOptions as AnswerOption[] | null;
  const correctOption = options?.find((o) => question.correctKeys.includes(o.id)) ?? null;

  // Idempotent, same guard as submitAnswer — a second reveal (or a reveal
  // after the question was already answered) just returns the existing state.
  if (attempt.status !== "answered") {
    const totalMs = attempt.firstViewedAt
      ? Math.max(0, new Date(now).getTime() - new Date(attempt.firstViewedAt).getTime())
      : attempt.totalMs;

    await db.orm.public.Attempt.where({ id: item.id }).update({
      status: "answered",
      selectedOptionId: null,
      selectedLetter: null,
      isCorrect: false,
      gradable: true,
      answerRevealed: true,
      submittedAt: now,
      totalMs,
    });

    // Counts toward gradedCount (a question was resolved) but never
    // correctCount — giving up is never a correct answer.
    await db.orm.public.PracticeSet.where({ id: setId }).update({
      gradedCount: set.gradedCount + 1,
    });
  }

  const finalAttempt = await db.orm.public.Attempt.first({ id: item.id });
  return {
    isCorrect: finalAttempt!.isCorrect,
    gradable: finalAttempt!.gradable,
    totalMs: finalAttempt!.totalMs,
    rationaleHtml: renderContentField({ html: question.rationale, contentHash: question.contentHash, field: "rationale" }),
    correctOptionId: correctOption?.id ?? null,
    correctLetter: correctOption?.letter ?? null,
    correctAnswer: question.correctAnswer,
  };
}

/**
 * Persists the coach's post-answer chat for this question so leaving and
 * revisiting it (or the "Clear chat" button, called with `[]`) restores
 * exactly what was left behind. `getOwnedItem` with no policy argument closes
 * this to exam-mode sets, same as `submitAnswer`/`revealAnswer`/`/api/coach`
 * — exam mode has no coach at all.
 */
export async function saveCoachChat(setId: string, position: number, messages: CoachMessage[]): Promise<void> {
  const { item } = await getOwnedItem(setId, position);
  await db.orm.public.Attempt.where({ id: item.id }).update({
    chatMessages: toJsonValue(messages),
  });
}

// The five functions below (toggleEliminateOption .. recordTime) are shared
// verbatim between practice and exam mode — they pass an explicit
// 'exam-write'/'exam-telemetry' policy so exam sets get the deadline/
// active-module gate instead of getOwnedItem's practice-only default,
// while a practice-mode call is a no-op through that same gate (its
// `set.mode !== 'exam'` check short-circuits). See src/lib/access.ts's
// ItemAccessPolicy doc comment.

export async function toggleEliminateOption(setId: string, position: number, optionId: string): Promise<string[]> {
  const { item } = await getOwnedItem(setId, position, "exam-write");
  const attempt = await db.orm.public.Attempt.first({ id: item.id });
  if (!attempt) throw new Error("View the question before eliminating an option.");

  const next = attempt.eliminatedOptionIds.includes(optionId)
    ? attempt.eliminatedOptionIds.filter((id) => id !== optionId)
    : [...attempt.eliminatedOptionIds, optionId];

  await db.orm.public.Attempt.where({ id: item.id }).update({
    eliminatedOptionIds: next,
    eliminationCount: attempt.eliminationCount + 1,
  });
  return next;
}

export async function toggleMarkForReview(setId: string, position: number): Promise<boolean> {
  const { item } = await getOwnedItem(setId, position, "exam-write");
  const attempt = await db.orm.public.Attempt.first({ id: item.id });
  if (!attempt) throw new Error("View the question before marking it for review.");
  const next = !attempt.markedForReview;
  await db.orm.public.Attempt.where({ id: item.id }).update({ markedForReview: next });
  return next;
}

export async function saveAnnotations(
  setId: string,
  position: number,
  input: { notes: string | null; highlights: unknown[] },
): Promise<void> {
  const { item } = await getOwnedItem(setId, position, "exam-write");
  await db.orm.public.Attempt.where({ id: item.id }).update({
    notes: input.notes,
    highlights: toJsonValue(input.highlights),
    highlightCount: input.highlights.length,
  });
}

/** Both fields are "was this tool ever opened during this attempt" — they only ever go false→true. */
export async function recordToolUsage(
  setId: string,
  position: number,
  tool: "calculator" | "reference",
  additionalOpenMs = 0,
): Promise<void> {
  const { item } = await getOwnedItem(setId, position, "exam-telemetry");
  if (tool === "calculator") {
    const attempt = await db.orm.public.Attempt.first({ id: item.id });
    await db.orm.public.Attempt.where({ id: item.id }).update({
      calculatorOpened: true,
      calculatorOpenMs: (attempt?.calculatorOpenMs ?? 0) + additionalOpenMs,
    });
  } else {
    await db.orm.public.Attempt.where({ id: item.id }).update({ referenceOpened: true });
  }
}

/**
 * Adds to the running timing totals — called periodically (alongside the
 * event-buffer flush) plus right before navigating away, so a crashed tab
 * still leaves partial data rather than none. `activeMs` (visible+focused
 * time) and `afterFeedbackMs` (time spent reading the revealed rationale)
 * are both inherently client-observed; `totalMs` is instead recomputed
 * server-side from real timestamps whenever the attempt is answered (see
 * `submitAnswer`), so it isn't accumulated here.
 */
export async function recordTime(
  setId: string,
  position: number,
  delta: { activeMs?: number; afterFeedbackMs?: number },
): Promise<void> {
  const { set, item } = await getOwnedItem(setId, position, "exam-telemetry");
  const attempt = await db.orm.public.Attempt.first({ id: item.id });
  if (!attempt) return;
  const activeDelta = Math.max(0, Math.round(delta.activeMs ?? 0));
  await db.orm.public.Attempt.where({ id: item.id }).update({
    activeMs: attempt.activeMs + activeDelta,
    timeAfterFeedbackMs: attempt.timeAfterFeedbackMs + Math.max(0, Math.round(delta.afterFeedbackMs ?? 0)),
  });
  if (activeDelta > 0) {
    await db.orm.public.PracticeSet.where({ id: setId }).update({
      totalActiveMs: set.totalActiveMs + activeDelta,
    });
  }
}

export async function completeSet(setId: string): Promise<void> {
  const profileId = await requireProfileId();
  const set = await db.orm.public.PracticeSet.first({ id: setId, profileId });
  if (!set) throw new Error("Set not found.");
  if (set.mode !== "practice") throw new Error("This action is not available for exam sets.");
  const now = new Date().toISOString();
  await db.orm.public.PracticeSet.where({ id: setId, profileId }).update({
    status: "completed",
    completedAt: now,
  });
  revalidatePath(`/sets/${setId}/results`);
  redirect(`/sets/${setId}/results`);
}
